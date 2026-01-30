import { CopilotClient, CopilotSession, SessionEvent, defineTool } from "@github/copilot-sdk";
import { App, TFile, Notice } from "obsidian";
import { SkillRegistry, VaultCopilotSkill } from "./SkillRegistry";

export interface CopilotServiceConfig {
	model: string;
	cliPath?: string;
	cliUrl?: string;
	streaming: boolean;
	/** Skill registry for plugin-registered skills */
	skillRegistry?: SkillRegistry;
	/** Directories containing skill definition files */
	skillDirectories?: string[];
	/** Directories containing custom agent definition files */
	agentDirectories?: string[];
	/** Directories containing instruction files */
	instructionDirectories?: string[];
}

export interface ChatMessage {
	role: "user" | "assistant";
	content: string;
	timestamp: Date;
}

/**
 * Service class that wraps the GitHub Copilot SDK for use in Obsidian.
 * Handles client lifecycle, session management, and provides Obsidian-specific tools.
 */
export class CopilotService {
	private client: CopilotClient | null = null;
	private session: CopilotSession | null = null;
	private app: App;
	private config: CopilotServiceConfig;
	private messageHistory: ChatMessage[] = [];
	private eventHandlers: ((event: SessionEvent) => void)[] = [];

	constructor(app: App, config: CopilotServiceConfig) {
		this.app = app;
		this.config = config;
	}

	/**
	 * Initialize and start the Copilot client
	 */
	async start(): Promise<void> {
		if (this.client) {
			return;
		}

		const clientOptions: Record<string, unknown> = {};
		
		if (this.config.cliPath) {
			clientOptions.cliPath = this.config.cliPath;
		}
		
		if (this.config.cliUrl) {
			clientOptions.cliUrl = this.config.cliUrl;
		}

		this.client = new CopilotClient(clientOptions);
		await this.client.start();
	}

	/**
	 * Stop the Copilot client and clean up resources
	 */
	async stop(): Promise<void> {
		if (this.session) {
			await this.session.destroy();
			this.session = null;
		}
		if (this.client) {
			await this.client.stop();
			this.client = null;
		}
		this.messageHistory = [];
	}

	/**
	 * Create a new chat session with Obsidian-specific tools
	 */
	async createSession(): Promise<void> {
		// Auto-start client if not running
		if (!this.client) {
			await this.start();
		}

		if (this.session) {
			await this.session.destroy();
		}

		// Combine built-in tools with registered plugin skills
		const builtInTools = this.createObsidianTools();
		const registeredTools = this.convertRegisteredSkillsToTools();
		const tools = [...builtInTools, ...registeredTools];

		// Build session config
		const sessionConfig: Record<string, unknown> = {
			model: this.config.model,
			streaming: this.config.streaming,
			tools,
			systemMessage: {
				content: this.getSystemPrompt(),
			},
		};

		// Add skill directories if configured
		if (this.config.skillDirectories && this.config.skillDirectories.length > 0) {
			sessionConfig.skillDirectories = this.config.skillDirectories;
		}

		// Add custom agents from agent directories if configured
		if (this.config.agentDirectories && this.config.agentDirectories.length > 0) {
			sessionConfig.customAgents = this.buildCustomAgentsConfig();
		}

		this.session = await this.client!.createSession(sessionConfig as any);

		// Set up event handler
		this.session.on((event: SessionEvent) => {
			this.handleSessionEvent(event);
		});

		this.messageHistory = [];
	}

	/**
	 * Convert registered skills from SkillRegistry to SDK-compatible tools
	 */
	private convertRegisteredSkillsToTools(): ReturnType<typeof defineTool>[] {
		if (!this.config.skillRegistry) {
			return [];
		}

		const tools: ReturnType<typeof defineTool>[] = [];
		
		// Get all skills that have handlers
		const registry = this.config.skillRegistry;
		for (const skillInfo of registry.listSkills()) {
			const skill = registry.getSkill(skillInfo.name);
			if (!skill) continue;

			// Convert VaultCopilotSkill to SDK tool using defineTool
			const tool = defineTool(skill.name, {
				description: skill.description,
				parameters: skill.parameters as any,
				handler: async (args: Record<string, unknown>) => {
					const result = await skill.handler(args);
					// Convert SkillResult to tool result format
					if (result.success) {
						return result.data ?? { success: true, message: "Skill executed successfully" };
					} else {
						return { success: false, error: result.error ?? "Skill execution failed" };
					}
				},
			});
			
			tools.push(tool);
		}

		return tools;
	}

	/**
	 * Build custom agents configuration from agent directories
	 */
	private buildCustomAgentsConfig(): Array<{ name: string; slug: string; instructions: string }> {
		// For now, return empty array - agents will be loaded from directories by the SDK
		// The SDK's customAgents expects an array of agent configurations
		// When agentDirectories is set, the CLI will discover agents from those paths
		return [];
	}

	/**
	 * Send a message and wait for the complete response
	 */
	async sendMessage(prompt: string): Promise<string> {
		if (!this.session) {
			await this.createSession();
		}

		this.messageHistory.push({
			role: "user",
			content: prompt,
			timestamp: new Date(),
		});

		const response = await this.session!.sendAndWait({ prompt });
		
		const assistantContent = response?.data?.content || "";
		this.messageHistory.push({
			role: "assistant",
			content: assistantContent,
			timestamp: new Date(),
		});

		return assistantContent;
	}

	/**
	 * Send a message with streaming response
	 */
	async sendMessageStreaming(
		prompt: string, 
		onDelta: (delta: string) => void,
		onComplete?: (fullContent: string) => void
	): Promise<void> {
		if (!this.session) {
			await this.createSession();
		}

		this.messageHistory.push({
			role: "user",
			content: prompt,
			timestamp: new Date(),
		});

		let fullContent = "";

		return new Promise<void>((resolve, reject) => {
			const unsubscribe = this.session!.on((event: SessionEvent) => {
				if (event.type === "assistant.message_delta") {
					const delta = (event.data as { deltaContent: string }).deltaContent;
					fullContent += delta;
					onDelta(delta);
				} else if (event.type === "assistant.message") {
					fullContent = (event.data as { content: string }).content;
				} else if (event.type === "session.idle") {
					this.messageHistory.push({
						role: "assistant",
						content: fullContent,
						timestamp: new Date(),
					});
					if (onComplete) {
						onComplete(fullContent);
					}
					unsubscribe();
					resolve();
				} else if (event.type === "session.error") {
					unsubscribe();
					reject(new Error("Session error during streaming"));
				}
			});

			this.session!.send({ prompt }).catch((err) => {
				unsubscribe();
				reject(err);
			});
		});
	}

	/**
	 * Abort the current operation
	 */
	async abort(): Promise<void> {
		if (this.session) {
			await this.session.abort();
		}
	}

	/**
	 * Get message history
	 */
	getMessageHistory(): ChatMessage[] {
		return [...this.messageHistory];
	}

	/**
	 * Clear message history and create a new session
	 */
	async clearHistory(): Promise<void> {
		this.messageHistory = [];
		await this.createSession();
	}

	/**
	 * Get current session state for persistence
	 */
	getSessionState(): { messages: ChatMessage[] } {
		return {
			messages: [...this.messageHistory],
		};
	}

	/**
	 * Load a previous session by restoring message history
	 * Note: This recreates the session context by replaying the message history
	 */
	async loadSession(sessionId: string, messages: ChatMessage[]): Promise<void> {
		if (!this.client) {
			await this.start();
		}

		// Create a fresh session
		await this.createSession();

		// Restore the message history
		this.messageHistory = messages.map(msg => ({
			...msg,
			timestamp: new Date(msg.timestamp),
		}));

		// Session ID is tracked externally by the plugin settings
		// The actual chat context would need to be rebuilt by the model
		// For a full implementation, the SDK would need to support session persistence
	}

	/**
	 * Subscribe to session events
	 */
	onEvent(handler: (event: SessionEvent) => void): () => void {
		this.eventHandlers.push(handler);
		return () => {
			const index = this.eventHandlers.indexOf(handler);
			if (index > -1) {
				this.eventHandlers.splice(index, 1);
			}
		};
	}

	/**
	 * Check if the service is connected
	 */
	isConnected(): boolean {
		return this.client !== null;
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<CopilotServiceConfig>): void {
		this.config = { ...this.config, ...config };
	}

	private handleSessionEvent(event: SessionEvent): void {
		for (const handler of this.eventHandlers) {
			handler(event);
		}
	}

	private getSystemPrompt(): string {
		return `You are a helpful AI assistant integrated into Obsidian, a powerful knowledge management application.

## Your Capabilities
- **Read notes**: Use read_note to get a single note, or batch_read_notes for multiple notes at once
- **Search**: Use search_notes to find notes by content or title
- **Create**: Use create_note to create new notes
- **Update**: Use update_note to replace entire note content, or append_to_note to add to the end
- **Patch**: Use patch_note to insert content at specific locations (after headings, block references, etc.)
- **Delete**: Use delete_note to remove notes (moves to system trash)
- **Rename/Move**: Use rename_note to move or rename notes
- **Recent changes**: Use get_recent_changes to see recently modified files
- **Daily notes**: Use get_daily_note to get today's or a specific date's daily note
- **Active note**: Use get_active_note to get the currently open note
- **List notes**: Use list_notes to browse notes in folders

## Available Slash Commands
When the user asks about available commands, help, or what you can do, respond ONLY with this list of slash commands available in GitHub Copilot for Obsidian:

### Note Commands
| Command | Description |
|---------|-------------|
| \`/help\` | Show available slash commands |
| \`/read <path>\` | Read a note by path |
| \`/search <query>\` | Search for notes |
| \`/list [folder]\` | List notes in a folder |
| \`/create <path> [content]\` | Create a new note |
| \`/append <path> <content>\` | Append content to a note |
| \`/update <path> <content>\` | Update/replace entire note content |
| \`/delete <path>\` | Delete a note (moves to trash) |
| \`/rename <old> <new>\` | Rename or move a note |
| \`/recent [count]\` | Show recently modified notes |
| \`/daily [YYYY-MM-DD]\` | Get today's or a specific date's daily note |
| \`/active\` | Get the currently active note |
| \`/batch <path1> <path2>...\` | Read multiple notes at once |

### Session Commands
| Command | Description |
|---------|-------------|
| \`/sessions\` | List all chat sessions |
| \`/new [name]\` | Create a new chat session |
| \`/archive\` | Archive the current session |
| \`/clear\` | Clear chat history |

**Important**: Do NOT mention CLI commands, keyboard shortcuts, or any commands that are not in the list above. The user is asking about this Obsidian plugin's commands, not a terminal CLI.

## Public API for Other Plugins
When the user asks about the API, respond with the following information about this plugin's public API that other Obsidian plugins can use:

\`\`\`typescript
// Get the Vault Copilot API from another plugin
const vc = (app as any).plugins.plugins['obsidian-vault-copilot']?.api;

// Check connection status
vc.isConnected(): boolean

// Connection management
await vc.connect(): Promise<void>
await vc.disconnect(): Promise<void>

// Chat functionality
await vc.sendMessage(prompt: string): Promise<string>
await vc.sendMessageStreaming(prompt, onDelta, onComplete): Promise<void>
vc.getMessageHistory(): ChatMessage[]
await vc.clearHistory(): Promise<void>

// Session management
vc.listSessions(): SessionInfo[]
vc.getActiveSessionId(): string | null
await vc.createSession(name?): Promise<SessionInfo>
await vc.loadSession(sessionId): Promise<void>
await vc.archiveSession(sessionId): Promise<void>
await vc.unarchiveSession(sessionId): Promise<void>
await vc.deleteSession(sessionId): Promise<void>
await vc.renameSession(sessionId, newName): Promise<void>

// Note operations
await vc.readNote(path): Promise<{ success, content?, error? }>
await vc.searchNotes(query, limit?): Promise<{ results: Array<{ path, title, excerpt }> }>
await vc.createNote(path, content): Promise<{ success, path?, error? }>
await vc.updateNote(path, content): Promise<{ success, error? }>
await vc.deleteNote(path): Promise<{ success, error? }>
await vc.appendToNote(path, content): Promise<{ success, error? }>
await vc.batchReadNotes(paths): Promise<{ results: Array<{ path, success, content?, error? }> }>
await vc.renameNote(oldPath, newPath): Promise<{ success, newPath?, error? }>

// Utility operations
await vc.getActiveNote(): Promise<{ hasActiveNote, path?, title?, content? }>
await vc.listNotes(folder?): Promise<{ notes: Array<{ path, title }> }>
await vc.getRecentChanges(limit?): Promise<{ files: Array<{ path, title, mtime, mtimeFormatted }> }>
await vc.getDailyNote(date?): Promise<{ success, path?, content?, exists, error? }>
\`\`\`

## Guidelines
- When the user asks about their notes, use the available tools to fetch the content
- Format your responses in Markdown, which Obsidian renders natively
- **Always use [[wikilinks]] when referencing files in the vault** so users can click to navigate (e.g., [[Daily Notes/2026-01-29]] or [[Projects/My Project.md]])
- Be concise but helpful
- If you're unsure about something, ask for clarification
- For bulk operations, prefer batch_read_notes over multiple read_note calls

## Context
You are running inside Obsidian and have access to the user's vault through the provided tools.

## Customization Directories
The following directories are configured for extending your capabilities:

${this.getCustomizationDirectoriesInfo()}
`;
	}

	/**
	 * Generate information about configured customization directories
	 */
	private getCustomizationDirectoriesInfo(): string {
		const sections: string[] = [];

		const agentDirs = this.config.agentDirectories || [];
		if (agentDirs.length > 0) {
			sections.push(`### Agent Directories
Agents are custom personas with specific instructions and tool configurations.
Locations: ${agentDirs.map(d => `\`${d}\``).join(', ')}
File pattern: \`*.agent.md\``);
		}

		const skillDirs = this.config.skillDirectories || [];
		if (skillDirs.length > 0) {
			sections.push(`### Skill Directories
Skills define reusable capabilities and tool definitions. Each skill is a subfolder containing a SKILL.md file.
Locations: ${skillDirs.map(d => `\`${d}\``).join(', ')}
Structure: \`<skill-name>/SKILL.md\``);
		}

		const instructionDirs = this.config.instructionDirectories || [];
		if (instructionDirs.length > 0) {
			sections.push(`### Instruction Directories
Instructions provide additional context and guidelines for your responses.
Locations: ${instructionDirs.map(d => `\`${d}\``).join(', ')}
File pattern: \`*.instructions.md\``);
		}

		if (sections.length === 0) {
			return 'No customization directories are configured. Users can add agent, skill, and instruction directories in the plugin settings.';
		}

		return sections.join('\n\n');
	}

	private createObsidianTools() {
		return [
			defineTool("read_note", {
				description: "Read the content of a note from the Obsidian vault by its path",
				parameters: {
					type: "object",
					properties: {
						path: { type: "string", description: "The path to the note file (e.g., 'folder/note.md' or 'note.md')" }
					},
					required: ["path"]
				},
				handler: async (args: { path: string }) => {
					return await this.readNote(args.path);
				},
			}),

			defineTool("search_notes", {
				description: "Search for notes in the Obsidian vault by content or title",
				parameters: {
					type: "object",
					properties: {
						query: { type: "string", description: "The search query" },
						limit: { type: "number", description: "Maximum number of results to return (default: 10)" }
					},
					required: ["query"]
				},
				handler: async (args: { query: string; limit?: number }) => {
					return await this.searchNotes(args.query, args.limit ?? 10);
				},
			}),

			defineTool("create_note", {
				description: "Create a new note in the Obsidian vault",
				parameters: {
					type: "object",
					properties: {
						path: { type: "string", description: "The path for the new note (e.g., 'folder/note.md')" },
						content: { type: "string", description: "The content of the note in Markdown format" }
					},
					required: ["path", "content"]
				},
				handler: async (args: { path: string; content: string }) => {
					return await this.createNote(args.path, args.content);
				},
			}),

			defineTool("get_active_note", {
				description: "Get information about the currently active note in Obsidian",
				parameters: {
					type: "object",
					properties: {},
					required: []
				},
				handler: async () => {
					return await this.getActiveNote();
				},
			}),

			defineTool("list_notes", {
				description: "List all notes in the vault or in a specific folder",
				parameters: {
					type: "object",
					properties: {
						folder: { type: "string", description: "Optional folder path to list notes from" }
					},
					required: []
				},
				handler: async (args: { folder?: string }) => {
					return await this.listNotes(args.folder);
				},
			}),

			defineTool("append_to_note", {
				description: "Append content to an existing note",
				parameters: {
					type: "object",
					properties: {
						path: { type: "string", description: "The path to the note file" },
						content: { type: "string", description: "The content to append" }
					},
					required: ["path", "content"]
				},
				handler: async (args: { path: string; content: string }) => {
					return await this.appendToNote(args.path, args.content);
				},
			}),

			defineTool("batch_read_notes", {
				description: "Read multiple notes at once. More efficient than calling read_note multiple times.",
				parameters: {
					type: "object",
					properties: {
						paths: { 
							type: "array", 
							items: { type: "string" },
							description: "Array of note paths to read" 
						}
					},
					required: ["paths"]
				},
				handler: async (args: { paths: string[] }) => {
					return await this.batchReadNotes(args.paths);
				},
			}),

			defineTool("update_note", {
				description: "Update/replace the entire content of an existing note",
				parameters: {
					type: "object",
					properties: {
						path: { type: "string", description: "The path to the note file" },
						content: { type: "string", description: "The new content to replace the existing content" }
					},
					required: ["path", "content"]
				},
				handler: async (args: { path: string; content: string }) => {
					return await this.updateNote(args.path, args.content);
				},
			}),

			defineTool("delete_note", {
				description: "Delete a note from the vault. Use with caution.",
				parameters: {
					type: "object",
					properties: {
						path: { type: "string", description: "The path to the note file to delete" }
					},
					required: ["path"]
				},
				handler: async (args: { path: string }) => {
					return await this.deleteNote(args.path);
				},
			}),

			defineTool("get_recent_changes", {
				description: "Get recently modified files in the vault",
				parameters: {
					type: "object",
					properties: {
						limit: { type: "number", description: "Maximum number of files to return (default: 10)" }
					},
					required: []
				},
				handler: async (args: { limit?: number }) => {
					return await this.getRecentChanges(args.limit ?? 10);
				},
			}),

			defineTool("patch_note", {
				description: "Insert content at a specific location in a note, relative to a heading, block reference, or frontmatter",
				parameters: {
					type: "object",
					properties: {
						path: { type: "string", description: "The path to the note file" },
						operation: { 
							type: "string", 
							enum: ["append", "prepend", "replace"],
							description: "The operation to perform: append (after target), prepend (before target), or replace (replace target section)" 
						},
						target_type: { 
							type: "string", 
							enum: ["heading", "block", "frontmatter", "end"],
							description: "Type of target: heading (by heading text), block (by block ID), frontmatter, or end (end of file)" 
						},
						target: { type: "string", description: "The target identifier (heading text, block ID, or empty for frontmatter/end)" },
						content: { type: "string", description: "The content to insert" }
					},
					required: ["path", "operation", "target_type", "content"]
				},
				handler: async (args: { path: string; operation: string; target_type: string; target?: string; content: string }) => {
					return await this.patchNote(args.path, args.operation, args.target_type, args.target, args.content);
				},
			}),

			defineTool("get_daily_note", {
				description: "Get today's daily note or a daily note for a specific date",
				parameters: {
					type: "object",
					properties: {
						date: { type: "string", description: "Optional date in YYYY-MM-DD format. Defaults to today." }
					},
					required: []
				},
				handler: async (args: { date?: string }) => {
					return await this.getDailyNote(args.date);
				},
			}),

			defineTool("rename_note", {
				description: "Rename or move a note to a new path",
				parameters: {
					type: "object",
					properties: {
						oldPath: { type: "string", description: "The current path of the note" },
						newPath: { type: "string", description: "The new path for the note" }
					},
					required: ["oldPath", "newPath"]
				},
				handler: async (args: { oldPath: string; newPath: string }) => {
					return await this.renameNote(args.oldPath, args.newPath);
				},
			}),
		];
	}

	async readNote(path: string): Promise<{ success: boolean; content?: string; error?: string }> {
		try {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!file || !(file instanceof TFile)) {
				return { success: false, error: `Note not found: ${path}` };
			}
			const content = await this.app.vault.read(file);
			return { success: true, content };
		} catch (error) {
			return { success: false, error: `Failed to read note: ${error}` };
		}
	}

	async searchNotes(query: string, limit: number): Promise<{ results: Array<{ path: string; title: string; excerpt: string }> }> {
		const files = this.app.vault.getMarkdownFiles();
		const results: Array<{ path: string; title: string; excerpt: string }> = [];
		const lowerQuery = query.toLowerCase();

		for (const file of files) {
			if (results.length >= limit) break;

			const titleMatch = file.basename.toLowerCase().includes(lowerQuery);
			let contentMatch = false;
			let excerpt = "";

			try {
				const content = await this.app.vault.cachedRead(file);
				const lowerContent = content.toLowerCase();
				const queryIndex = lowerContent.indexOf(lowerQuery);
				
				if (queryIndex !== -1) {
					contentMatch = true;
					const start = Math.max(0, queryIndex - 50);
					const end = Math.min(content.length, queryIndex + query.length + 50);
					excerpt = (start > 0 ? "..." : "") + content.slice(start, end) + (end < content.length ? "..." : "");
				}
			} catch {
				// Skip files that can't be read
			}

			if (titleMatch || contentMatch) {
				results.push({
					path: file.path,
					title: file.basename,
					excerpt: excerpt || file.basename,
				});
			}
		}

		return { results };
	}

	async createNote(path: string, content: string): Promise<{ success: boolean; path?: string; error?: string }> {
		try {
			// Ensure path ends with .md
			const normalizedPath = path.endsWith(".md") ? path : `${path}.md`;
			
			// Check if file already exists
			const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
			if (existing) {
				return { success: false, error: `Note already exists: ${normalizedPath}` };
			}

			await this.app.vault.create(normalizedPath, content);
			return { success: true, path: normalizedPath };
		} catch (error) {
			return { success: false, error: `Failed to create note: ${error}` };
		}
	}

	async getActiveNote(): Promise<{ hasActiveNote: boolean; path?: string; title?: string; content?: string }> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			return { hasActiveNote: false };
		}

		try {
			const content = await this.app.vault.read(activeFile);
			return {
				hasActiveNote: true,
				path: activeFile.path,
				title: activeFile.basename,
				content,
			};
		} catch {
			return {
				hasActiveNote: true,
				path: activeFile.path,
				title: activeFile.basename,
			};
		}
	}

	async listNotes(folder?: string): Promise<{ notes: Array<{ path: string; title: string }> }> {
		const files = this.app.vault.getMarkdownFiles();
		const notes = files
			.filter(file => !folder || file.path.startsWith(folder))
			.map(file => ({
				path: file.path,
				title: file.basename,
			}))
			.slice(0, 100); // Limit to 100 notes

		return { notes };
	}

	async appendToNote(path: string, content: string): Promise<{ success: boolean; error?: string }> {
		try {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!file || !(file instanceof TFile)) {
				return { success: false, error: `Note not found: ${path}` };
			}
			await this.app.vault.append(file, "\n" + content);
			return { success: true };
		} catch (error) {
			return { success: false, error: `Failed to append to note: ${error}` };
		}
	}

	async batchReadNotes(paths: string[]): Promise<{ results: Array<{ path: string; success: boolean; content?: string; error?: string }> }> {
		const results = await Promise.all(
			paths.map(async (path) => {
				try {
					const file = this.app.vault.getAbstractFileByPath(path);
					if (!file || !(file instanceof TFile)) {
						return { path, success: false, error: `Note not found: ${path}` };
					}
					const content = await this.app.vault.read(file);
					return { path, success: true, content };
				} catch (error) {
					return { path, success: false, error: `Failed to read note: ${error}` };
				}
			})
		);
		return { results };
	}

	async updateNote(path: string, content: string): Promise<{ success: boolean; error?: string }> {
		try {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!file || !(file instanceof TFile)) {
				return { success: false, error: `Note not found: ${path}` };
			}
			await this.app.vault.modify(file, content);
			return { success: true };
		} catch (error) {
			return { success: false, error: `Failed to update note: ${error}` };
		}
	}

	async deleteNote(path: string): Promise<{ success: boolean; error?: string }> {
		try {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!file || !(file instanceof TFile)) {
				return { success: false, error: `Note not found: ${path}` };
			}
			await this.app.vault.trash(file, true); // Move to system trash for safety
			return { success: true };
		} catch (error) {
			return { success: false, error: `Failed to delete note: ${error}` };
		}
	}

	async getRecentChanges(limit: number): Promise<{ files: Array<{ path: string; title: string; mtime: number; mtimeFormatted: string }> }> {
		const files = this.app.vault.getMarkdownFiles()
			.sort((a, b) => b.stat.mtime - a.stat.mtime)
			.slice(0, limit)
			.map(file => ({
				path: file.path,
				title: file.basename,
				mtime: file.stat.mtime,
				mtimeFormatted: new Date(file.stat.mtime).toISOString(),
			}));
		return { files };
	}

	async patchNote(
		path: string, 
		operation: string, 
		targetType: string, 
		target: string | undefined, 
		content: string
	): Promise<{ success: boolean; error?: string }> {
		try {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!file || !(file instanceof TFile)) {
				return { success: false, error: `Note not found: ${path}` };
			}

			const fileContent = await this.app.vault.read(file);
			let newContent: string;

			if (targetType === "end") {
				// Simply append to end
				newContent = fileContent + "\n" + content;
			} else if (targetType === "frontmatter") {
				// Handle frontmatter
				const frontmatterMatch = fileContent.match(/^---\n([\s\S]*?)\n---/);
				if (frontmatterMatch) {
					const frontmatterEnd = frontmatterMatch[0].length;
					if (operation === "append") {
						newContent = fileContent.slice(0, frontmatterEnd) + "\n" + content + fileContent.slice(frontmatterEnd);
					} else if (operation === "prepend") {
						newContent = content + "\n" + fileContent;
					} else {
						// replace frontmatter
						newContent = content + fileContent.slice(frontmatterEnd);
					}
				} else {
					// No frontmatter exists
					if (operation === "prepend" || operation === "append") {
						newContent = content + "\n" + fileContent;
					} else {
						newContent = content + "\n" + fileContent;
					}
				}
			} else if (targetType === "heading") {
				// Find heading
				const headingRegex = new RegExp(`^(#{1,6})\\s+${this.escapeRegex(target || "")}\\s*$`, "m");
				const match = fileContent.match(headingRegex);
				if (!match || match.index === undefined || !match[1]) {
					return { success: false, error: `Heading not found: ${target}` };
				}

				const headingLevel = match[1].length;
				const headingEnd = (match.index as number) + match[0].length;

				// Find the end of this section (next heading of same or higher level, or EOF)
				const restContent = fileContent.slice(headingEnd);
				const nextHeadingRegex = new RegExp(`^#{1,${headingLevel}}\\s+`, "m");
				const nextMatch = restContent.match(nextHeadingRegex);
				const sectionEnd = nextMatch && nextMatch.index !== undefined 
					? headingEnd + nextMatch.index 
					: fileContent.length;

				if (operation === "prepend") {
					// Insert right after the heading line
					newContent = fileContent.slice(0, headingEnd) + "\n" + content + fileContent.slice(headingEnd);
				} else if (operation === "append") {
					// Insert at the end of the section
					newContent = fileContent.slice(0, sectionEnd) + "\n" + content + fileContent.slice(sectionEnd);
				} else {
					// Replace the entire section content (keep heading)
					newContent = fileContent.slice(0, headingEnd) + "\n" + content + "\n" + fileContent.slice(sectionEnd);
				}
			} else if (targetType === "block") {
				// Find block reference ^blockid
				const blockRegex = new RegExp(`\\^${this.escapeRegex(target || "")}\\s*$`, "m");
				const match = fileContent.match(blockRegex);
				if (!match || match.index === undefined) {
					return { success: false, error: `Block reference not found: ^${target}` };
				}

				// Find the start of the line containing the block reference
				const beforeMatch = fileContent.slice(0, match.index);
				const lineStart = beforeMatch.lastIndexOf("\n") + 1;
				const lineEnd = match.index + match[0].length;

				if (operation === "prepend") {
					newContent = fileContent.slice(0, lineStart) + content + "\n" + fileContent.slice(lineStart);
				} else if (operation === "append") {
					newContent = fileContent.slice(0, lineEnd) + "\n" + content + fileContent.slice(lineEnd);
				} else {
					// Replace the entire block line
					newContent = fileContent.slice(0, lineStart) + content + " ^" + target + fileContent.slice(lineEnd);
				}
			} else {
				return { success: false, error: `Unknown target type: ${targetType}` };
			}

			await this.app.vault.modify(file, newContent);
			return { success: true };
		} catch (error) {
			return { success: false, error: `Failed to patch note: ${error}` };
		}
	}

	private escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	async getDailyNote(date?: string): Promise<{ success: boolean; path?: string; content?: string; exists: boolean; error?: string }> {
		try {
			// Determine the date
			const targetDate = date ? new Date(date) : new Date();
			const dateStr = targetDate.toISOString().split("T")[0]; // YYYY-MM-DD format

			// Common daily note folder patterns
			const possiblePaths = [
				`Daily Notes/${dateStr}.md`,
				`daily/${dateStr}.md`,
				`Daily/${dateStr}.md`,
				`journal/${dateStr}.md`,
				`Journal/${dateStr}.md`,
				`${dateStr}.md`,
			];

			// Try to find existing daily note
			for (const path of possiblePaths) {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file && file instanceof TFile) {
					const content = await this.app.vault.read(file);
					return { success: true, path: file.path, content, exists: true };
				}
			}

			// Also search for files matching the date in their name
			const files = this.app.vault.getMarkdownFiles();
			for (const file of files) {
				if (dateStr && (file.basename === dateStr || file.basename.includes(dateStr))) {
					const content = await this.app.vault.read(file);
					return { success: true, path: file.path, content, exists: true };
				}
			}

			return { success: true, exists: false, error: `No daily note found for ${dateStr}. Common paths checked: ${possiblePaths.join(", ")}` };
		} catch (error) {
			return { success: false, exists: false, error: `Failed to get daily note: ${error}` };
		}
	}

	async renameNote(oldPath: string, newPath: string): Promise<{ success: boolean; newPath?: string; error?: string }> {
		try {
			const file = this.app.vault.getAbstractFileByPath(oldPath);
			if (!file || !(file instanceof TFile)) {
				return { success: false, error: `Note not found: ${oldPath}` };
			}

			// Ensure new path ends with .md
			const normalizedNewPath = newPath.endsWith(".md") ? newPath : `${newPath}.md`;

			// Check if target already exists
			const existing = this.app.vault.getAbstractFileByPath(normalizedNewPath);
			if (existing) {
				return { success: false, error: `A note already exists at: ${normalizedNewPath}` };
			}

			await this.app.fileManager.renameFile(file, normalizedNewPath);
			return { success: true, newPath: normalizedNewPath };
		} catch (error) {
			return { success: false, error: `Failed to rename note: ${error}` };
		}
	}
}
