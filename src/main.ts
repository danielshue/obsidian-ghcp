import { Plugin, Notice, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, CopilotPluginSettings, CopilotSettingTab, CopilotSession } from "./settings";
import { CopilotService, CopilotServiceConfig, ChatMessage } from "./copilot/CopilotService";
import { CopilotChatView, COPILOT_VIEW_TYPE } from "./ui/CopilotChatView";
import { 
	SkillRegistry, 
	getSkillRegistry, 
	VaultCopilotSkill, 
	SkillInfo, 
	SkillResult,
	McpServerConfig,
	SkillRegistryEvent
} from "./copilot/SkillRegistry";
import { AgentCache, CachedAgentInfo } from "./copilot/AgentCache";
import { PromptCache, CachedPromptInfo } from "./copilot/PromptCache";
import { CustomPrompt } from "./copilot/CustomizationLoader";

/**
 * Session info returned by the API
 */
export interface SessionInfo {
	id: string;
	name: string;
	createdAt: number;
	lastUsedAt: number;
	completedAt?: number;
	durationMs?: number;
	archived: boolean;
	messageCount: number;
}

// Re-export skill types for external plugins
export type { VaultCopilotSkill, SkillInfo, SkillResult, McpServerConfig, SkillRegistryEvent, CachedAgentInfo, CachedPromptInfo, CustomPrompt };

/**
 * Public API for other plugins to interact with Vault Copilot
 */
export interface VaultCopilotAPI {
	/** Check if the Copilot service is connected */
	isConnected(): boolean;
	
	/** Connect to GitHub Copilot */
	connect(): Promise<void>;
	
	/** Disconnect from GitHub Copilot */
	disconnect(): Promise<void>;
	
	/** Send a message and wait for the complete response */
	sendMessage(prompt: string): Promise<string>;
	
	/** Send a message with streaming response */
	sendMessageStreaming(
		prompt: string,
		onDelta: (delta: string) => void,
		onComplete?: (fullContent: string) => void
	): Promise<void>;
	
	/** Get message history from the current session */
	getMessageHistory(): ChatMessage[];
	
	/** Clear the current chat session */
	clearHistory(): Promise<void>;
	
	// ===== Session Management =====
	
	/** List all sessions */
	listSessions(): SessionInfo[];
	
	/** Get the active session ID */
	getActiveSessionId(): string | null;
	
	/** Create a new session */
	createSession(name?: string): Promise<SessionInfo>;
	
	/** Load a session by ID */
	loadSession(sessionId: string): Promise<void>;
	
	/** Archive a session */
	archiveSession(sessionId: string): Promise<void>;
	
	/** Unarchive a session */
	unarchiveSession(sessionId: string): Promise<void>;
	
	/** Delete a session */
	deleteSession(sessionId: string): Promise<void>;
	
	/** Rename a session */
	renameSession(sessionId: string, newName: string): Promise<void>;
	
	// ===== Skill Registration =====
	
	/** 
	 * Register a custom skill/tool that the AI can invoke
	 * @throws Error if skill with same name already exists
	 */
	registerSkill(skill: VaultCopilotSkill): void;
	
	/** 
	 * Update an existing skill
	 * @throws Error if skill doesn't exist
	 */
	updateSkill(skill: VaultCopilotSkill): void;
	
	/** Unregister a skill by name */
	unregisterSkill(name: string): boolean;
	
	/** Unregister all skills from a plugin */
	unregisterPluginSkills(pluginId: string): number;
	
	/** List all registered skills */
	listSkills(): SkillInfo[];
	
	/** List skills by category */
	listSkillsByCategory(category: string): SkillInfo[];
	
	/** List skills registered by a specific plugin */
	listSkillsByPlugin(pluginId: string): SkillInfo[];
	
	/** Check if a skill is registered */
	hasSkill(name: string): boolean;
	
	/** Execute a skill by name */
	executeSkill(name: string, args: Record<string, unknown>): Promise<SkillResult>;
	
	/** Subscribe to skill registry changes */
	onSkillChange(listener: (event: SkillRegistryEvent) => void): () => void;
	
	// ===== MCP Server Configuration =====
	
	/** Configure an MCP server */
	configureMcpServer(id: string, config: McpServerConfig): void;
	
	/** Remove an MCP server configuration */
	removeMcpServer(id: string): boolean;
	
	/** Get all configured MCP servers */
	getMcpServers(): Map<string, McpServerConfig>;
	
	// ===== Prompt Operations =====
	
	/** List all available prompts */
	listPrompts(): CachedPromptInfo[];
	
	/** Get a prompt by name (cached info only) */
	getPromptInfo(name: string): CachedPromptInfo | undefined;
	
	/** Get the full prompt content by name */
	getFullPrompt(name: string): Promise<CustomPrompt | undefined>;
	
	/** Execute a prompt by name */
	executePrompt(name: string, variables?: Record<string, string>): Promise<string>;
	
	// ===== Note Operations =====
	
	/** Read a note by path */
	readNote(path: string): Promise<{ success: boolean; content?: string; error?: string }>;
	
	/** Search notes by query */
	searchNotes(query: string, limit?: number): Promise<{ results: Array<{ path: string; title: string; excerpt: string }> }>;
	
	/** Create a new note */
	createNote(path: string, content: string): Promise<{ success: boolean; path?: string; error?: string }>;
	
	/** Get the currently active note */
	getActiveNote(): Promise<{ hasActiveNote: boolean; path?: string; title?: string; content?: string }>;
	
	/** List notes in a folder */
	listNotes(folder?: string): Promise<{ notes: Array<{ path: string; title: string }> }>;
	
	/** Append content to a note */
	appendToNote(path: string, content: string): Promise<{ success: boolean; error?: string }>;
	
	/** Read multiple notes at once */
	batchReadNotes(paths: string[]): Promise<{ results: Array<{ path: string; success: boolean; content?: string; error?: string }> }>;
	
	/** Update/replace entire note content */
	updateNote(path: string, content: string): Promise<{ success: boolean; error?: string }>;
	
	/** Delete a note (moves to trash) */
	deleteNote(path: string): Promise<{ success: boolean; error?: string }>;
	
	/** Get recently modified files */
	getRecentChanges(limit?: number): Promise<{ files: Array<{ path: string; title: string; mtime: number; mtimeFormatted: string }> }>;
	
	/** Get daily note for a date */
	getDailyNote(date?: string): Promise<{ success: boolean; path?: string; content?: string; exists: boolean; error?: string }>;
	
	/** Rename/move a note */
	renameNote(oldPath: string, newPath: string): Promise<{ success: boolean; newPath?: string; error?: string }>;
}

export default class CopilotPlugin extends Plugin {
	settings: CopilotPluginSettings;
	copilotService: CopilotService | null = null;
	skillRegistry: SkillRegistry;
	agentCache: AgentCache;
	promptCache: PromptCache;
	private statusBarEl: HTMLElement | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Initialize skill registry
		this.skillRegistry = getSkillRegistry();

		// Initialize agent cache
		this.agentCache = new AgentCache(this.app);
		await this.agentCache.initialize(this.settings.agentDirectories);

		// Initialize prompt cache
		this.promptCache = new PromptCache(this.app);
		await this.promptCache.initialize(this.settings.promptDirectories);

		// Initialize Copilot service
		this.copilotService = new CopilotService(this.app, this.getServiceConfig());

		// Register the chat view
		this.registerView(
			COPILOT_VIEW_TYPE,
			(leaf) => new CopilotChatView(leaf, this, this.copilotService!)
		);

		// Add ribbon icon to open chat
		this.addRibbonIcon("message-square", "Open GitHub Copilot for Obsidian", () => {
			this.activateChatView();
		});

		// Add status bar item
		if (this.settings.showInStatusBar) {
			this.statusBarEl = this.addStatusBarItem();
			this.statusBarEl.addEventListener("click", () => {
				this.toggleCopilotView();
			});
			this.updateStatusBar();
		}

		// Add commands
		this.addCommand({
			id: "open-copilot-chat",
			name: "Open chat",
			callback: () => {
				this.activateChatView();
			},
		});

		this.addCommand({
			id: "copilot-new-chat",
			name: "Start new chat",
			callback: async () => {
				if (this.copilotService) {
					await this.copilotService.clearHistory();
					await this.activateChatView();
					new Notice("Started new Copilot chat");
				}
			},
		});

		this.addCommand({
			id: "copilot-summarize-note",
			name: "Summarize current note",
			editorCallback: async () => {
				await this.activateChatView();
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && this.copilotService) {
					// The view will handle the actual message sending
					new Notice("Opening Copilot to summarize note...");
				}
			},
		});

		this.addCommand({
			id: "copilot-connect",
			name: "Connect to Copilot",
			callback: async () => {
				await this.connectCopilot();
			},
		});

		this.addCommand({
			id: "copilot-disconnect",
			name: "Disconnect from Copilot",
			callback: async () => {
				await this.disconnectCopilot();
			},
		});

		// Add settings tab
		this.addSettingTab(new CopilotSettingTab(this.app, this));

		// Auto-connect on startup (optional)
		// await this.connectCopilot();
	}

	async onunload(): Promise<void> {
		await this.disconnectCopilot();
		this.agentCache?.destroy();
		this.promptCache?.destroy();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<CopilotPluginSettings>);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		
		// Update service config when settings change
		if (this.copilotService) {
			this.copilotService.updateConfig(this.getServiceConfig());
		}
		
		// Update agent cache when agent directories change
		if (this.agentCache) {
			await this.agentCache.updateDirectories(this.settings.agentDirectories);
		}
		
		// Update prompt cache when prompt directories change
		if (this.promptCache) {
			await this.promptCache.updateDirectories(this.settings.promptDirectories);
		}
	}

	private getServiceConfig(): CopilotServiceConfig {
		// Resolve relative paths to absolute paths based on vault location
		const vaultPath = this.getVaultBasePath();
		
		const resolvePaths = (paths: string[]): string[] => {
			if (!vaultPath) return paths;
			return paths.map(p => {
				// If already absolute, use as-is
				if (p.startsWith('/') || p.match(/^[A-Za-z]:\\/)) {
					return p;
				}
				// Otherwise, resolve relative to vault
				return `${vaultPath}/${p}`.replace(/\\/g, '/');
			});
		};

		return {
			model: this.settings.model,
			cliPath: this.settings.cliPath || undefined,
			cliUrl: this.settings.cliUrl || undefined,
			streaming: this.settings.streaming,
			skillRegistry: this.skillRegistry,
			skillDirectories: resolvePaths(this.settings.skillDirectories),
			agentDirectories: resolvePaths(this.settings.agentDirectories),
			instructionDirectories: resolvePaths(this.settings.instructionDirectories),
			promptDirectories: resolvePaths(this.settings.promptDirectories),
		};
	}

	private getVaultBasePath(): string | undefined {
		const adapter = this.app.vault.adapter;
		if ('getBasePath' in adapter && typeof adapter.getBasePath === 'function') {
			return adapter.getBasePath();
		}
		return undefined;
	}

	async activateChatView(): Promise<void> {
		const { workspace } = this.app;
		
		let leaf = workspace.getLeavesOfType(COPILOT_VIEW_TYPE)[0];

		if (!leaf) {
			// Open in right sidebar by default
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				leaf = rightLeaf;
				await leaf.setViewState({ type: COPILOT_VIEW_TYPE, active: true });
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	async connectCopilot(): Promise<void> {
		if (!this.copilotService) {
			this.copilotService = new CopilotService(this.app, this.getServiceConfig());
		}

		try {
			await this.copilotService.start();
			this.updateStatusBar();
			new Notice("Connected to GitHub Copilot");
		} catch (error) {
			new Notice(`Failed to connect to Copilot: ${error}`);
		}
	}

	async disconnectCopilot(): Promise<void> {
		if (this.copilotService) {
			try {
				await this.copilotService.stop();
				this.updateStatusBar();
			} catch (error) {
				console.error("Error disconnecting Copilot:", error);
			}
		}
	}

	updateStatusBar(): void {
		if (!this.statusBarEl) {
			if (this.settings.showInStatusBar) {
				this.statusBarEl = this.addStatusBarItem();
				// Add click handler only once when creating the status bar
				this.statusBarEl.addEventListener("click", () => {
					this.toggleCopilotView();
				});
			} else {
				return;
			}
		}

		if (!this.settings.showInStatusBar) {
			this.statusBarEl.remove();
			this.statusBarEl = null;
			return;
		}

		const isConnected = this.copilotService?.isConnected() ?? false;
		this.statusBarEl.empty();
		
		const statusEl = this.statusBarEl.createSpan({ cls: "vc-status" });
		statusEl.setAttribute("aria-label", isConnected ? "Toggle Copilot window" : "Connect to Copilot");
		
		// GitHub Copilot logo SVG
		const logoEl = statusEl.createSpan({ cls: "vc-status-logo" });
		logoEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M7.25 2.5h1.5a4.75 4.75 0 0 1 4.75 4.75v.5a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1-.75-.75v-.5a3.25 3.25 0 0 0-3.25-3.25h-1.5a3.25 3.25 0 0 0-3.25 3.25v.5a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1-.75-.75v-.5A4.75 4.75 0 0 1 7.25 2.5zm-3 4.25a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0zm5.5 0a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0zM2 11.5c0-.83.67-1.5 1.5-1.5h9c.83 0 1.5.67 1.5 1.5v1c0 .83-.67 1.5-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-1zm1.5-.5a.5.5 0 0 0-.5.5v1c0 .28.22.5.5.5h9a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5h-9z"/></svg>`;
		
		// Connection status indicator
		statusEl.createSpan({ 
			cls: `vc-status-indicator ${isConnected ? "vc-connected" : "vc-disconnected"}` 
		});
	}

	/**
	 * Toggle the Copilot chat view visibility
	 */
	toggleCopilotView(): void {
		const { workspace } = this.app;
		const leaves = workspace.getLeavesOfType(COPILOT_VIEW_TYPE);
		
		if (leaves.length > 0) {
			// View exists - close it
			leaves.forEach(leaf => leaf.detach());
		} else {
			// View doesn't exist - open it
			this.activateChatView();
			// Auto-connect if not connected
			if (!this.copilotService?.isConnected()) {
				this.connectCopilot();
			}
		}
	}

	/**
	 * Load a previous session by ID
	 */
	async loadSession(sessionId: string): Promise<void> {
		// Find the session in settings
		const session = this.settings.sessions.find(s => s.id === sessionId);
		if (!session) {
			new Notice("Session not found");
			return;
		}

		if (this.copilotService) {
			await this.copilotService.loadSession(sessionId, session.messages || []);
			
			// Update settings to mark this session as active
			this.settings.activeSessionId = sessionId;
			session.lastUsedAt = Date.now();
			await this.saveSettings();
			
			this.activateChatView();
			new Notice(`Loaded session: ${session.name}`);
		}
	}

	/**
	 * Get the public API for other plugins to use
	 * Usage: const vc = (app as any).plugins.plugins['obsidian-vault-copilot']?.api;
	 */
	get api(): VaultCopilotAPI {
		const service = this.copilotService;
		const plugin = this;
		
		// Helper to convert CopilotSession to SessionInfo
		const toSessionInfo = (session: CopilotSession): SessionInfo => ({
			id: session.id,
			name: session.name,
			createdAt: session.createdAt,
			lastUsedAt: session.lastUsedAt,
			completedAt: session.completedAt,
			durationMs: session.durationMs,
			archived: session.archived,
			messageCount: session.messages?.length ?? 0,
		});
		
		return {
			isConnected: () => service?.isConnected() ?? false,
			
			connect: async () => {
				await plugin.connectCopilot();
			},
			
			disconnect: async () => {
				await plugin.disconnectCopilot();
			},
			
			sendMessage: async (prompt: string) => {
				if (!service) throw new Error("Copilot service not initialized");
				if (!service.isConnected()) await plugin.connectCopilot();
				return await service.sendMessage(prompt);
			},
			
			sendMessageStreaming: async (prompt, onDelta, onComplete) => {
				if (!service) throw new Error("Copilot service not initialized");
				if (!service.isConnected()) await plugin.connectCopilot();
				return await service.sendMessageStreaming(prompt, onDelta, onComplete);
			},
			
			getMessageHistory: () => service?.getMessageHistory() ?? [],
			
			clearHistory: async () => {
				if (!service) throw new Error("Copilot service not initialized");
				return await service.clearHistory();
			},
			
			// ===== Session Management =====
			
			listSessions: () => {
				return plugin.settings.sessions.map(toSessionInfo);
			},
			
			getActiveSessionId: () => {
				return plugin.settings.activeSessionId;
			},
			
			createSession: async (name?: string) => {
				const now = Date.now();
				const newSession: CopilotSession = {
					id: `session-${now}`,
					name: name || `Chat ${new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
					createdAt: now,
					lastUsedAt: now,
					archived: false,
					messages: [],
				};
				plugin.settings.sessions.push(newSession);
				plugin.settings.activeSessionId = newSession.id;
				await plugin.saveSettings();
				
				if (service) {
					await service.createSession();
				}
				
				return toSessionInfo(newSession);
			},
			
			loadSession: async (sessionId: string) => {
				const session = plugin.settings.sessions.find(s => s.id === sessionId);
				if (!session) throw new Error(`Session not found: ${sessionId}`);
				
				await plugin.loadSession(sessionId);
			},
			
			archiveSession: async (sessionId: string) => {
				const session = plugin.settings.sessions.find(s => s.id === sessionId);
				if (!session) throw new Error(`Session not found: ${sessionId}`);
				
				session.archived = true;
				session.completedAt = Date.now();
				
				const messages = session.messages || [];
				if (messages.length > 0) {
					const firstMsg = messages[0];
					const lastMsg = messages[messages.length - 1];
					if (firstMsg && lastMsg) {
						const firstMsgTime = new Date(firstMsg.timestamp).getTime();
						const lastMsgTime = new Date(lastMsg.timestamp).getTime();
						session.durationMs = lastMsgTime - firstMsgTime;
					}
				}
				
				await plugin.saveSettings();
			},
			
			unarchiveSession: async (sessionId: string) => {
				const session = plugin.settings.sessions.find(s => s.id === sessionId);
				if (!session) throw new Error(`Session not found: ${sessionId}`);
				
				session.archived = false;
				await plugin.saveSettings();
			},
			
			deleteSession: async (sessionId: string) => {
				const index = plugin.settings.sessions.findIndex(s => s.id === sessionId);
				if (index === -1) throw new Error(`Session not found: ${sessionId}`);
				
				plugin.settings.sessions.splice(index, 1);
				
				if (plugin.settings.activeSessionId === sessionId) {
					plugin.settings.activeSessionId = null;
				}
				
				await plugin.saveSettings();
			},
			
			renameSession: async (sessionId: string, newName: string) => {
				const session = plugin.settings.sessions.find(s => s.id === sessionId);
				if (!session) throw new Error(`Session not found: ${sessionId}`);
				
				session.name = newName;
				await plugin.saveSettings();
			},
			
			// ===== Note Operations =====
			
			readNote: async (path) => {
				if (!service) throw new Error("Copilot service not initialized");
				return await service.readNote(path);
			},
			
			searchNotes: async (query, limit = 10) => {
				if (!service) throw new Error("Copilot service not initialized");
				return await service.searchNotes(query, limit);
			},
			
			createNote: async (path, content) => {
				if (!service) throw new Error("Copilot service not initialized");
				return await service.createNote(path, content);
			},
			
			getActiveNote: async () => {
				if (!service) throw new Error("Copilot service not initialized");
				return await service.getActiveNote();
			},
			
			listNotes: async (folder) => {
				if (!service) throw new Error("Copilot service not initialized");
				return await service.listNotes(folder);
			},
			
			appendToNote: async (path, content) => {
				if (!service) throw new Error("Copilot service not initialized");
				return await service.appendToNote(path, content);
			},
			
			batchReadNotes: async (paths) => {
				if (!service) throw new Error("Copilot service not initialized");
				return await service.batchReadNotes(paths);
			},
			
			updateNote: async (path, content) => {
				if (!service) throw new Error("Copilot service not initialized");
				return await service.updateNote(path, content);
			},
			
			deleteNote: async (path) => {
				if (!service) throw new Error("Copilot service not initialized");
				return await service.deleteNote(path);
			},
			
			getRecentChanges: async (limit = 10) => {
				if (!service) throw new Error("Copilot service not initialized");
				return await service.getRecentChanges(limit);
			},
			
			getDailyNote: async (date) => {
				if (!service) throw new Error("Copilot service not initialized");
				return await service.getDailyNote(date);
			},
			
			renameNote: async (oldPath, newPath) => {
				if (!service) throw new Error("Copilot service not initialized");
				return await service.renameNote(oldPath, newPath);
			},
			
			// ===== Skill Registration =====
			
			registerSkill: (skill: VaultCopilotSkill) => {
				plugin.skillRegistry.registerSkill(skill);
			},
			
			updateSkill: (skill: VaultCopilotSkill) => {
				plugin.skillRegistry.updateSkill(skill);
			},
			
			unregisterSkill: (name: string) => {
				return plugin.skillRegistry.unregisterSkill(name);
			},
			
			unregisterPluginSkills: (pluginId: string) => {
				return plugin.skillRegistry.unregisterPluginSkills(pluginId);
			},
			
			listSkills: () => {
				return plugin.skillRegistry.listSkills();
			},
			
			listSkillsByCategory: (category: string) => {
				return plugin.skillRegistry.listSkillsByCategory(category);
			},
			
			listSkillsByPlugin: (pluginId: string) => {
				return plugin.skillRegistry.listSkillsByPlugin(pluginId);
			},
			
			hasSkill: (name: string) => {
				return plugin.skillRegistry.hasSkill(name);
			},
			
			executeSkill: async (name: string, args: Record<string, unknown>) => {
				return await plugin.skillRegistry.executeSkill(name, args);
			},
			
			onSkillChange: (listener: (event: SkillRegistryEvent) => void) => {
				return plugin.skillRegistry.onSkillChange(listener);
			},
			
			// ===== MCP Server Configuration =====
			
			configureMcpServer: (id: string, config: McpServerConfig) => {
				plugin.skillRegistry.configureMcpServer(id, config);
			},
			
			removeMcpServer: (id: string) => {
				return plugin.skillRegistry.removeMcpServer(id);
			},
			
			getMcpServers: () => {
				return plugin.skillRegistry.getMcpServers();
			},
			
			// ===== Prompt Operations =====
			
			listPrompts: () => {
				return plugin.promptCache.getPrompts();
			},
			
			getPromptInfo: (name: string) => {
				return plugin.promptCache.getPromptByName(name);
			},
			
			getFullPrompt: async (name: string) => {
				return await plugin.promptCache.getFullPrompt(name);
			},
			
			executePrompt: async (name: string, variables?: Record<string, string>) => {
				if (!service) throw new Error("Copilot service not initialized");
				if (!service.isConnected()) await plugin.connectCopilot();
				
				const prompt = await plugin.promptCache.getFullPrompt(name);
				if (!prompt) throw new Error(`Prompt not found: ${name}`);
				
				// Replace variables in the prompt content
				let content = prompt.content;
				if (variables) {
					for (const [key, value] of Object.entries(variables)) {
						content = content.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
					}
				}
				
				return await service.sendMessage(content);
			},
		};
	}
}
