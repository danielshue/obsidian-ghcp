import { Plugin, Notice, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, CopilotPluginSettings, CopilotSettingTab, CopilotSession } from "./settings";
import { CopilotService, CopilotServiceConfig, ChatMessage } from "./copilot/CopilotService";
import { CopilotChatView, COPILOT_VIEW_TYPE } from "./ui/CopilotChatView";

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
	private statusBarEl: HTMLElement | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

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
	}

	private getServiceConfig(): CopilotServiceConfig {
		return {
			model: this.settings.model,
			cliPath: this.settings.cliPath || undefined,
			cliUrl: this.settings.cliUrl || undefined,
			streaming: this.settings.streaming,
		};
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
		};
	}
}
