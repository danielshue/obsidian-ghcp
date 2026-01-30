import { ItemView, WorkspaceLeaf, MarkdownRenderer, Notice, TFile, FuzzySuggestModal, setIcon, Menu } from "obsidian";
import { CopilotService, ChatMessage } from "../copilot/CopilotService";
import CopilotPlugin from "../main";
import { AVAILABLE_MODELS, CopilotSession } from "../settings";
import { SessionPanel } from "./SessionPanel";
import { CachedAgentInfo } from "../copilot/AgentCache";
import { CachedPromptInfo } from "../copilot/PromptCache";

export const COPILOT_VIEW_TYPE = "copilot-chat-view";

// Slash commands that map to available tools
interface SlashCommand {
	name: string;
	description: string;
	usage: string;
	handler: (view: CopilotChatView, args: string) => Promise<string>;
}

const SLASH_COMMANDS: SlashCommand[] = [
	{
		name: "help",
		description: "Show available slash commands",
		usage: "/help",
		handler: async () => {
			const commands = SLASH_COMMANDS.map(cmd => `**${cmd.usage}** - ${cmd.description}`).join("\n");
			return `## Vault Copilot Slash Commands\n\nThese commands are available in the chat:\n\n${commands}\n\n---\n*Tip: You can also ask Copilot questions in natural language.*`;
		}
	},
	{
		name: "read",
		description: "Read a note by path",
		usage: "/read <path>",
		handler: async (view, args) => {
			if (!args) return "Usage: /read <path>\nExample: /read Daily Notes/2026-01-28.md";
			const result = await view.executeTool("read_note", { path: args }) as { success: boolean; content?: string; error?: string };
			if (result.success) {
				return `## ${args}\n\n${result.content}`;
			}
			return `Error: ${result.error}`;
		}
	},
	{
		name: "search",
		description: "Search for notes",
		usage: "/search <query>",
		handler: async (view, args) => {
			if (!args) return "Usage: /search <query>\nExample: /search project ideas";
			const result = await view.executeTool("search_notes", { query: args, limit: 10 }) as { results: Array<{ path: string; excerpt: string }> };
			if (result.results?.length > 0) {
				const list = result.results.map((r) => `- [[${r.path}]]: ${r.excerpt}`).join("\n");
				return `## Search Results for "${args}"\n\n${list}`;
			}
			return `No results found for "${args}"`;
		}
	},
	{
		name: "list",
		description: "List notes in a folder",
		usage: "/list [folder]",
		handler: async (view, args) => {
			const result = await view.executeTool("list_notes", { folder: args || undefined }) as { notes: Array<{ path: string }> };
			if (result.notes?.length > 0) {
				const list = result.notes.map((n) => `- [[${n.path}]]`).join("\n");
				return `## Notes${args ? ` in ${args}` : ""}\n\n${list}`;
			}
			return args ? `No notes found in "${args}"` : "No notes found in vault";
		}
	},
	{
		name: "create",
		description: "Create a new note",
		usage: "/create <path> [content]",
		handler: async (view, args) => {
			const match = args.match(/^(\S+)(?:\s+([\s\S]*))?$/);
			if (!match) return "Usage: /create <path> [content]\nExample: /create Projects/New Idea.md # My New Idea";
			const [, path, content] = match;
			const result = await view.executeTool("create_note", { path, content: content || "" }) as { success: boolean; path?: string; error?: string };
			if (result.success) {
				return `Created note: [[${result.path}]]`;
			}
			return `Error: ${result.error}`;
		}
	},
	{
		name: "append",
		description: "Append content to a note",
		usage: "/append <path> <content>",
		handler: async (view, args) => {
			const match = args.match(/^(\S+)\s+([\s\S]+)$/);
			if (!match) return "Usage: /append <path> <content>\nExample: /append Daily Notes/2026-01-28.md ## New Section";
			const [, path, content] = match;
			const result = await view.executeTool("append_to_note", { path, content }) as { success: boolean; error?: string };
			if (result.success) {
				return `Appended to [[${path}]]`;
			}
			return `Error: ${result.error}`;
		}
	},
	{
		name: "update",
		description: "Update/replace entire note content",
		usage: "/update <path> <content>",
		handler: async (view, args) => {
			const match = args.match(/^(\S+)\s+([\s\S]+)$/);
			if (!match) return "Usage: /update <path> <content>\nExample: /update note.md # New Content";
			const [, path, content] = match;
			const result = await view.executeTool("update_note", { path, content }) as { success: boolean; error?: string };
			if (result.success) {
				return `Updated [[${path}]]`;
			}
			return `Error: ${result.error}`;
		}
	},
	{
		name: "delete",
		description: "Delete a note (moves to trash)",
		usage: "/delete <path>",
		handler: async (view, args) => {
			if (!args) return "Usage: /delete <path>\nExample: /delete old-note.md";
			const result = await view.executeTool("delete_note", { path: args }) as { success: boolean; error?: string };
			if (result.success) {
				return `Deleted: ${args} (moved to trash)`;
			}
			return `Error: ${result.error}`;
		}
	},
	{
		name: "rename",
		description: "Rename or move a note",
		usage: "/rename <old-path> <new-path>",
		handler: async (view, args) => {
			const match = args.match(/^(\S+)\s+(\S+)$/);
			if (!match) return "Usage: /rename <old-path> <new-path>\nExample: /rename old.md new.md";
			const [, oldPath, newPath] = match;
			const result = await view.executeTool("rename_note", { oldPath, newPath }) as { success: boolean; newPath?: string; error?: string };
			if (result.success) {
				return `Renamed [[${oldPath}]] → [[${result.newPath}]]`;
			}
			return `Error: ${result.error}`;
		}
	},
	{
		name: "recent",
		description: "Show recently modified notes",
		usage: "/recent [count]",
		handler: async (view, args) => {
			const limit = parseInt(args) || 10;
			const result = await view.executeTool("get_recent_changes", { limit }) as { files: Array<{ path: string; mtimeFormatted: string }> };
			if (result.files?.length > 0) {
				const list = result.files.map((f) => 
					`- [[${f.path}]] - ${new Date(f.mtimeFormatted).toLocaleString()}`
				).join("\n");
				return `## Recently Modified\n\n${list}`;
			}
			return "No recent changes found";
		}
	},
	{
		name: "daily",
		description: "Get today's or a specific date's daily note",
		usage: "/daily [YYYY-MM-DD]",
		handler: async (view, args) => {
			const result = await view.executeTool("get_daily_note", { date: args || undefined }) as { exists: boolean; path?: string; content?: string; error?: string };
			if (result.exists && result.content) {
				return `## ${result.path}\n\n${result.content}`;
			}
			return result.error || "Daily note not found";
		}
	},
	{
		name: "active",
		description: "Get the currently active note",
		usage: "/active",
		handler: async (view) => {
			const result = await view.executeTool("get_active_note", {}) as { hasActiveNote: boolean; path?: string; content?: string };
			if (result.hasActiveNote && result.content) {
				return `## ${result.path}\n\n${result.content}`;
			}
			return "No active note open";
		}
	},
	{
		name: "batch",
		description: "Read multiple notes at once",
		usage: "/batch <path1> <path2> ...",
		handler: async (view, args) => {
			const paths = args.split(/\s+/).filter(p => p);
			if (paths.length === 0) return "Usage: /batch <path1> <path2> ...\nExample: /batch note1.md note2.md";
			const result = await view.executeTool("batch_read_notes", { paths }) as { results: Array<{ path: string; success: boolean; content?: string; error?: string }> };
			if (result.results?.length > 0) {
				const sections = result.results.map((r) => {
					if (r.success) {
						return `## ${r.path}\n\n${r.content}`;
					}
					return `## ${r.path}\n\nError: ${r.error}`;
				}).join("\n\n---\n\n");
				return sections;
			}
			return "No results";
		}
	},
	{
		name: "clear",
		description: "Clear chat history",
		usage: "/clear",
		handler: async (view) => {
			await view.clearChat();
			return ""; // Don't show a message, the UI is cleared
		}
	},
	// Session management commands
	{
		name: "sessions",
		description: "List all chat sessions",
		usage: "/sessions",
		handler: async (view) => {
			const sessions = view.plugin.settings.sessions;
			if (sessions.length === 0) return "No sessions yet. Start chatting to create your first session.";
			const active = sessions.filter(s => !s.archived);
			const archived = sessions.filter(s => s.archived);
			let output = "## Chat Sessions\n\n";
			if (active.length > 0) {
				output += "### Active\n" + active.map(s => `- **${s.name}** (${s.messages.length} messages)`).join("\n") + "\n\n";
			}
			if (archived.length > 0) {
				output += "### Archived\n" + archived.map(s => `- ${s.name} (${s.messages.length} messages)`).join("\n");
			}
			return output;
		}
	},
	{
		name: "new",
		description: "Create a new chat session",
		usage: "/new [name]",
		handler: async (view, args) => {
			await view.createNewSession(args || undefined);
			return "";
		}
	},
	{
		name: "archive",
		description: "Archive current session",
		usage: "/archive",
		handler: async (view) => {
			const sessionId = view.plugin.settings.activeSessionId;
			if (!sessionId) return "No active session to archive.";
			const session = view.plugin.settings.sessions.find(s => s.id === sessionId);
			if (!session) return "Session not found.";
			session.archived = true;
			session.completedAt = Date.now();
			await view.plugin.saveSettings();
			await view.createNewSession();
			return `Archived: ${session.name}`;
		}
	}
];

// Note picker modal for attaching notes
class NoteSuggestModal extends FuzzySuggestModal<TFile> {
	private onSelect: (file: TFile) => void;

	constructor(plugin: CopilotPlugin, onSelect: (file: TFile) => void) {
		super(plugin.app);
		this.onSelect = onSelect;
		this.setPlaceholder("Select a note to attach...");
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.onSelect(file);
	}
}

export class CopilotChatView extends ItemView {
	public plugin: CopilotPlugin;
	private copilotService: CopilotService;
	private messagesContainer: HTMLElement;
	private inputEl: HTMLTextAreaElement;
	private sendButton: HTMLButtonElement;
	private isProcessing = false;
	private currentStreamingMessageEl: HTMLElement | null = null;
	private attachedNotes: TFile[] = [];
	private attachmentsContainer: HTMLElement | null = null;
	private sessionPanel: SessionPanel | null = null;
	private sessionPanelEl: HTMLElement | null = null;
	private mainViewEl: HTMLElement | null = null;
	private sessionPanelVisible = false;
	private resizerEl: HTMLElement | null = null;
	private sessionToggleBtnEl: HTMLElement | null = null;
	private isResizing = false;
	private selectedAgent: CachedAgentInfo | null = null;
	private agentSelectorEl: HTMLButtonElement | null = null;
	private agentCacheUnsubscribe: (() => void) | null = null;
	private promptPickerEl: HTMLElement | null = null;
	private promptCacheUnsubscribe: (() => void) | null = null;
	private promptPickerVisible = false;
	private promptPickerSelectedIndex = 0;
	private filteredPrompts: CachedPromptInfo[] = [];

	constructor(leaf: WorkspaceLeaf, plugin: CopilotPlugin, copilotService: CopilotService) {
		super(leaf);
		this.plugin = plugin;
		this.copilotService = copilotService;
	}

	getViewType(): string {
		return COPILOT_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Vault Copilot";
	}

	getIcon(): string {
		return "message-square";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		if (!container) return;
		container.empty();
		container.addClass("vc-chat-container");

		// Create a wrapper for the layout (main view + session panel on right)
		const layoutWrapper = container.createDiv({ cls: "vc-layout-wrapper" });

		// Main view wrapper (comes first, on left)
		this.mainViewEl = layoutWrapper.createDiv({ cls: "vc-main-view" });

		// Resizer handle (hidden by default, shown when panel visible)
		this.resizerEl = layoutWrapper.createDiv({ cls: "vc-resizer" });
		this.resizerEl.style.display = "none";
		this.setupResizer();

		// Session panel on right (hidden by default)
		this.sessionPanelEl = layoutWrapper.createDiv({ cls: "vc-session-panel-wrapper" });
		this.sessionPanelEl.style.display = "none";
		this.sessionPanel = new SessionPanel(this.plugin, this.sessionPanelEl, {
			onSessionSelect: (session) => this.loadSession(session),
			onNewSession: () => this.createNewSession(),
			onClose: () => this.toggleSessionPanel(),
		});

		// Header toolbar
		const header = this.mainViewEl.createDiv({ cls: "vc-chat-header" });
		
		// Session name on the left
		const sessionTitle = header.createDiv({ cls: "vc-header-title" });
		sessionTitle.setText(this.getCurrentSessionName());
		
		// Single session toggle button on the right
		this.sessionToggleBtnEl = header.createEl("button", {
			cls: "vc-header-btn vc-session-toggle-btn",
			attr: { "aria-label": "Toggle sessions" }
		});
		// Sidebar/panel toggle icon
		setIcon(this.sessionToggleBtnEl, "panel-right");
		this.sessionToggleBtnEl.addEventListener("click", () => this.toggleSessionPanel());

		// Messages container
		this.messagesContainer = this.mainViewEl.createDiv({ cls: "vc-messages" });

		// Input area
		const inputArea = this.mainViewEl.createDiv({ cls: "vc-input-area" });
		
		// Attachments display area (above the input box)
		this.attachmentsContainer = inputArea.createDiv({ cls: "vc-attachments" });
		this.attachmentsContainer.style.display = "none";
		this.attachmentsContainer.removeClass("vc-has-attachments");

		// Main input wrapper (the box)
		const inputWrapper = inputArea.createDiv({ cls: "vc-input-wrapper" });
		
		// Prompt picker dropdown (hidden by default, shown when user types /)
		this.promptPickerEl = inputWrapper.createDiv({ cls: "vc-prompt-picker" });
		this.promptPickerEl.style.display = "none";
		
		// Subscribe to prompt cache changes
		this.promptCacheUnsubscribe = this.plugin.promptCache.onCacheChange(() => {
			// If picker is visible, refresh the list
			if (this.promptPickerVisible) {
				this.updatePromptPicker(this.inputEl.value);
			}
		});
		
		// Textarea that grows with content
		this.inputEl = inputWrapper.createEl("textarea", {
			cls: "vc-input",
			attr: { 
				placeholder: "Ask Vault Copilot anything or type / for prompts",
				rows: "1"
			}
		});

		// Bottom toolbar inside the input box
		const inputToolbar = inputWrapper.createDiv({ cls: "vc-input-toolbar" });
		
		// Left side icons
		const toolbarLeft = inputToolbar.createDiv({ cls: "vc-toolbar-left" });
		
		// Paperclip button for attaching notes
		const attachBtn = toolbarLeft.createEl("button", { 
			cls: "vc-toolbar-btn",
			attr: { "aria-label": "Attach a note" }
		});
		attachBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>`;
		attachBtn.addEventListener("click", () => this.openNotePicker());

		// Agent selector button
		this.agentSelectorEl = toolbarLeft.createEl("button", { 
			cls: "vc-agent-selector",
			attr: { "aria-label": "Select agent" }
		});
		this.updateAgentSelectorText();

		// Subscribe to agent cache changes to refresh the dropdown
		this.agentCacheUnsubscribe = this.plugin.agentCache.onCacheChange((event) => {
			// When cache is reloaded (e.g., new directory added), check if selected agent still exists
			if (event.type === 'loaded') {
				if (this.selectedAgent) {
					// Check if the selected agent is still in the new list
					const stillExists = event.agents.some(a => a.path === this.selectedAgent?.path);
					if (!stillExists) {
						this.selectedAgent = null;
						this.updateAgentSelectorText();
					}
				}
			}
			// If selected agent was removed, reset selection
			else if (event.type === 'removed' && this.selectedAgent?.path === event.path) {
				this.selectedAgent = null;
				this.updateAgentSelectorText();
			}
			// If selected agent was updated, refresh its info
			else if (event.type === 'updated' && this.selectedAgent?.path === event.agent.path) {
				this.selectedAgent = event.agent;
				this.updateAgentSelectorText();
			}
		});
		
		this.agentSelectorEl.addEventListener("click", (e) => {
			const menu = new Menu();
			
			// Default option (no agent)
			menu.addItem((item) => {
				item.setTitle("Default")
					.onClick(() => {
						this.selectedAgent = null;
						this.updateAgentSelectorText();
					});
				if (this.selectedAgent === null) {
					item.setChecked(true);
				}
			});
			
			// Get agents from the plugin's cache (already loaded)
			const agents = this.plugin.agentCache.getAgents();
			
			if (agents.length > 0) {
				menu.addSeparator();
				
				for (const agent of agents) {
					menu.addItem((item) => {
						item.setTitle(agent.name)
							.onClick(() => {
								this.selectedAgent = agent;
								this.updateAgentSelectorText();
								new Notice(`Agent: ${agent.name}`);
							});
						if (this.selectedAgent?.name === agent.name) {
							item.setChecked(true);
						}
						// Add description as tooltip-like text
						const itemEl = (item as any).dom as HTMLElement;
						if (agent.description) {
							const descSpan = itemEl.createSpan({ cls: "vc-agent-desc", text: agent.description });
							itemEl.appendChild(descSpan);
						}
					});
				}
			} else if (this.plugin.settings.agentDirectories.length === 0) {
				menu.addItem((item) => {
					item.setTitle("No agent directories configured")
						.setDisabled(true);
				});
			} else {
				menu.addItem((item) => {
					item.setTitle("No agents found")
						.setDisabled(true);
				});
			}
			
			menu.showAtMouseEvent(e as MouseEvent);
		});

		// Model selector button
		const modelSelector = toolbarLeft.createEl("button", { 
			cls: "vc-model-selector",
			attr: { "aria-label": "Select model" }
		});
		const updateModelSelectorText = () => {
			const currentModel = AVAILABLE_MODELS.find(m => m.value === this.plugin.settings.model);
			modelSelector.textContent = currentModel?.name || "Claude Sonnet 4.5";
		};
		updateModelSelectorText();
		
		modelSelector.addEventListener("click", (e) => {
			const menu = new Menu();
			
			// Auto section
			const autoModel = AVAILABLE_MODELS.find(m => m.section === "auto");
			if (autoModel) {
				menu.addItem((item) => {
					item.setTitle(autoModel.name)
						.setSection("auto")
						.onClick(async () => {
							this.plugin.settings.model = autoModel.value;
							await this.plugin.saveSettings();
							this.copilotService.updateConfig({ model: autoModel.value });
							updateModelSelectorText();
						});
					if (this.plugin.settings.model === autoModel.value) {
						item.setChecked(true);
					}
					const itemEl = (item as any).dom as HTMLElement;
					const rateSpan = itemEl.createSpan({ cls: "vc-model-rate", text: autoModel.rate });
					itemEl.appendChild(rateSpan);
				});
			}
			
			// Other models
			AVAILABLE_MODELS.filter(m => m.section !== "auto").forEach((model) => {
				menu.addItem((item) => {
					item.setTitle(model.name)
						.onClick(async () => {
							this.plugin.settings.model = model.value;
							await this.plugin.saveSettings();
							this.copilotService.updateConfig({ model: model.value });
							updateModelSelectorText();
						});
					if (this.plugin.settings.model === model.value) {
						item.setChecked(true);
					}
					const itemEl = (item as any).dom as HTMLElement;
					const rateSpan = itemEl.createSpan({ cls: "vc-model-rate", text: model.rate });
					itemEl.appendChild(rateSpan);
				});
			});
			
			menu.showAtMouseEvent(e as MouseEvent);
		});
		
		// Right side icons
		const toolbarRight = inputToolbar.createDiv({ cls: "vc-toolbar-right" });
		
		// Voice button (placeholder)
		const voiceBtn = toolbarRight.createEl("button", { 
			cls: "vc-toolbar-btn",
			attr: { "aria-label": "Voice input (coming soon)" }
		});
		voiceBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>`;
		voiceBtn.addEventListener("click", () => new Notice("Voice input coming soon!"));

		// Send button
		this.sendButton = toolbarRight.createEl("button", { 
			cls: "vc-send-btn",
			attr: { "aria-label": "Send message" }
		});
		this.sendButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>`;

		// Event listeners
		this.inputEl.addEventListener("keydown", (e) => {
			// Handle prompt picker navigation
			if (this.promptPickerVisible) {
				if (e.key === "ArrowDown") {
					e.preventDefault();
					this.promptPickerSelectedIndex = Math.min(
						this.promptPickerSelectedIndex + 1,
						this.filteredPrompts.length - 1
					);
					this.highlightPromptPickerItem();
					return;
				}
				if (e.key === "ArrowUp") {
					e.preventDefault();
					this.promptPickerSelectedIndex = Math.max(this.promptPickerSelectedIndex - 1, 0);
					this.highlightPromptPickerItem();
					return;
				}
				if (e.key === "Enter" || e.key === "Tab") {
					e.preventDefault();
					this.selectPromptFromPicker();
					return;
				}
				if (e.key === "Escape") {
					e.preventDefault();
					this.hidePromptPicker();
					return;
				}
			}
			
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		});

		this.inputEl.addEventListener("input", () => {
			this.autoResizeInput();
			this.handlePromptPickerInput();
		});

		this.sendButton.addEventListener("click", () => this.handleSendOrCancel());

		// Load existing messages
		await this.loadMessages();

		// Add welcome message if no history
		if (this.copilotService.getMessageHistory().length === 0) {
			this.addWelcomeMessage();
		}

		// Auto-start the Copilot service when panel opens
		this.startService();

		// Register keyboard shortcuts
		this.registerKeyboardShortcuts();
	}

	private async startService(): Promise<void> {
		try {
			if (!this.copilotService.isConnected()) {
				await this.copilotService.start();
				this.plugin.updateStatusBar();
			}
		} catch (error) {
			console.error("Failed to start Copilot service:", error);
		}
	}

	/**
	 * Toggle the session panel visibility
	 */
	private toggleSessionPanel(): void {
		this.sessionPanelVisible = !this.sessionPanelVisible;
		
		if (this.sessionPanelEl) {
			this.sessionPanelEl.style.display = this.sessionPanelVisible ? "flex" : "none";
			if (this.sessionPanelVisible && this.sessionPanel) {
				this.sessionPanel.render();
			}
		}
		
		if (this.resizerEl) {
			this.resizerEl.style.display = this.sessionPanelVisible ? "block" : "none";
		}
		
		// Hide the toggle button when panel is open, show when closed
		if (this.sessionToggleBtnEl) {
			this.sessionToggleBtnEl.style.display = this.sessionPanelVisible ? "none" : "flex";
		}
	}

	/**
	 * Setup the resizer drag functionality
	 */
	private setupResizer(): void {
		if (!this.resizerEl) return;

		const resizer = this.resizerEl;
		
		const onMouseDown = (e: MouseEvent) => {
			e.preventDefault();
			this.isResizing = true;
			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
			
			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);
		};

		const onMouseMove = (e: MouseEvent) => {
			if (!this.isResizing || !this.sessionPanelEl) return;
			
			const container = this.containerEl.children[1] as HTMLElement;
			if (!container) return;
			
			const containerRect = container.getBoundingClientRect();
			const newPanelWidth = containerRect.right - e.clientX;
			
			// Constrain panel width between 200px and 50% of container
			const minWidth = 200;
			const maxWidth = containerRect.width * 0.5;
			const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newPanelWidth));
			
			this.sessionPanelEl.style.width = `${constrainedWidth}px`;
			this.sessionPanelEl.style.flex = "none";
		};

		const onMouseUp = () => {
			this.isResizing = false;
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
			
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
		};

		resizer.addEventListener("mousedown", onMouseDown);
	}

	/**
	 * Get the current session name for display
	 */
	private getCurrentSessionName(): string {
		const activeSessionId = this.plugin.settings.activeSessionId;
		if (activeSessionId) {
			const session = this.plugin.settings.sessions.find(s => s.id === activeSessionId);
			if (session) {
				return session.name;
			}
		}
		return "New Chat";
	}

	/**
	 * Update the header title with current session name
	 */
	private updateHeaderTitle(): void {
		const titleEl = this.containerEl.querySelector(".vc-header-title");
		if (titleEl) {
			titleEl.setText(this.getCurrentSessionName());
		}
	}

	/**
	 * Update the agent selector button text
	 */
	private updateAgentSelectorText(): void {
		if (!this.agentSelectorEl) return;
		
		if (this.selectedAgent) {
			this.agentSelectorEl.textContent = this.selectedAgent.name;
			this.agentSelectorEl.addClass("vc-agent-selected");
		} else {
			this.agentSelectorEl.textContent = "Agent";
			this.agentSelectorEl.removeClass("vc-agent-selected");
		}
	}

	/**
	 * Get the currently selected agent
	 */
	getSelectedAgent(): CachedAgentInfo | null {
		return this.selectedAgent;
	}

	/**
	 * Create a new chat session
	 */
	async createNewSession(name?: string): Promise<void> {
		// Save current session before creating new one
		await this.saveCurrentSession();

		// Refresh agent cache to pick up any new agents
		await this.plugin.agentCache.refreshCache();

		// Reset selected agent for new session
		this.selectedAgent = null;
		this.updateAgentSelectorText();

		// Create new session
		const now = Date.now();
		const defaultName = `Chat ${new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
		const newSession: CopilotSession = {
			id: `session-${now}`,
			name: name || defaultName,
			createdAt: now,
			lastUsedAt: now,
			archived: false,
			messages: [],
		};

		this.plugin.settings.sessions.push(newSession);
		this.plugin.settings.activeSessionId = newSession.id;
		await this.plugin.saveSettings();

		// Clear the current view and create new session
		await this.copilotService.createSession();
		this.messagesContainer.empty();
		this.addWelcomeMessage();
		this.updateHeaderTitle();

		// Hide session panel if visible
		if (this.sessionPanelVisible) {
			this.toggleSessionPanel();
		}

		new Notice("Started new chat");
	}

	/**
	 * Load a session by its data
	 */
	async loadSession(session: CopilotSession): Promise<void> {
		// Save current session first
		await this.saveCurrentSession();

		// Update active session
		this.plugin.settings.activeSessionId = session.id;
		session.lastUsedAt = Date.now();
		await this.plugin.saveSettings();

		// Load the session into the service
		await this.copilotService.loadSession(session.id, session.messages || []);

		// Clear and reload UI
		this.messagesContainer.empty();
		await this.loadMessages();

		if (this.copilotService.getMessageHistory().length === 0) {
			this.addWelcomeMessage();
		}

		this.updateHeaderTitle();

		// Hide session panel
		if (this.sessionPanelVisible) {
			this.toggleSessionPanel();
		}

		new Notice(`Loaded: ${session.name}`);
	}

	/**
	 * Save the current session's messages
	 */
	async saveCurrentSession(): Promise<void> {
		const activeSessionId = this.plugin.settings.activeSessionId;
		if (activeSessionId) {
			const session = this.plugin.settings.sessions.find(s => s.id === activeSessionId);
			if (session) {
				session.messages = this.copilotService.getMessageHistory();
				session.lastUsedAt = Date.now();
				await this.plugin.saveSettings();
			}
		}
	}

	/**
	 * Ensure a session exists in our tracking system before sending messages
	 */
	private async ensureSessionExists(): Promise<void> {
		// If there's already an active session, we're good
		if (this.plugin.settings.activeSessionId) {
			const existingSession = this.plugin.settings.sessions.find(
				s => s.id === this.plugin.settings.activeSessionId
			);
			if (existingSession) {
				return;
			}
		}

		// Create a new session
		const now = Date.now();
		const defaultName = `Chat ${new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
		const newSession: CopilotSession = {
			id: `session-${now}`,
			name: defaultName,
			createdAt: now,
			lastUsedAt: now,
			archived: false,
			messages: [],
		};

		this.plugin.settings.sessions.push(newSession);
		this.plugin.settings.activeSessionId = newSession.id;
		await this.plugin.saveSettings();
		
		this.updateHeaderTitle();
		console.log("[VC] Created new session:", newSession.name);
	}

	/**
	 * Close the chat view
	 */
	private closeView(): void {
		// Save before closing
		this.saveCurrentSession();
		this.leaf.detach();
	}

	/**
	 * Register keyboard shortcuts
	 */
	registerKeyboardShortcuts(): void {
		// Ctrl+N for new chat
		this.registerDomEvent(document, "keydown", (e: KeyboardEvent) => {
			if (e.ctrlKey && e.key === "n" && this.containerEl.contains(document.activeElement)) {
				e.preventDefault();
				this.createNewSession();
			}
		});
	}

	private openNotePicker(): void {
		new NoteSuggestModal(this.plugin, (file) => {
			this.attachNote(file);
		}).open();
	}

	private attachNote(file: TFile): void {
		// Avoid duplicates
		if (this.attachedNotes.some(n => n.path === file.path)) {
			new Notice("Note already attached");
			return;
		}
		
		this.attachedNotes.push(file);
		this.renderAttachments();
		new Notice(`Attached: ${file.basename}`);
	}

	private removeAttachment(file: TFile): void {
		this.attachedNotes = this.attachedNotes.filter(n => n.path !== file.path);
		this.renderAttachments();
	}

	private renderAttachments(): void {
		if (!this.attachmentsContainer) return;
		
		this.attachmentsContainer.empty();
		
		if (this.attachedNotes.length === 0) {
			this.attachmentsContainer.style.display = "none";
			this.attachmentsContainer.removeClass("vc-has-attachments");
			return;
		}
		
		this.attachmentsContainer.style.display = "flex";
		this.attachmentsContainer.addClass("vc-has-attachments");
		
		for (const file of this.attachedNotes) {
			const chip = this.attachmentsContainer.createDiv({ cls: "vc-attachment-chip" });
			
			const icon = chip.createSpan({ cls: "vc-attachment-icon" });
			icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
			
			chip.createSpan({ text: file.basename, cls: "vc-attachment-name" });
			
			const removeBtn = chip.createSpan({ cls: "vc-attachment-remove" });
			removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
			removeBtn.addEventListener("click", () => this.removeAttachment(file));
		}
	}

	async onClose(): Promise<void> {
		// Unsubscribe from agent cache changes
		if (this.agentCacheUnsubscribe) {
			this.agentCacheUnsubscribe();
			this.agentCacheUnsubscribe = null;
		}
		// Unsubscribe from prompt cache changes
		if (this.promptCacheUnsubscribe) {
			this.promptCacheUnsubscribe();
			this.promptCacheUnsubscribe = null;
		}
	}

	private async loadMessages(): Promise<void> {
		const history = this.copilotService.getMessageHistory();
		for (const message of history) {
			await this.renderMessage(message);
		}
		this.scrollToBottom();
	}

	private addWelcomeMessage(): void {
		const welcomeEl = this.messagesContainer.createDiv({ cls: "vc-welcome" });
		
		// Logo section
		const logoEl = welcomeEl.createDiv({ cls: "vc-welcome-logo" });
		logoEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
			<path d="M12 8V4H8"/>
			<rect width="16" height="12" x="4" y="8" rx="2"/>
			<path d="M2 14h2"/>
			<path d="M20 14h2"/>
			<path d="M15 13v2"/>
			<path d="M9 13v2"/>
		</svg>`;
		
		// Title
		welcomeEl.createEl("h2", { text: "Ask Vault Copilot", cls: "vc-welcome-title" });
		
		// Disclaimer
	welcomeEl.createEl("p", { text: "AI can make mistakes, review output carefully. Ask questions, trigger vault operations, and run skills powered by GitHub Copilot.", cls: "vc-welcome-disclaimer" });
	
	// Quick action button
	const quickAction = welcomeEl.createDiv({ cls: "vc-quick-action" });
	const btn = quickAction.createEl("button", { text: "Summarize the current note", cls: "vc-suggestion-btn" });
	btn.addEventListener("click", () => {
		this.inputEl.value = "Summarize the current note";
		this.sendMessage();
	});

	// Example questions section
	const examplesEl = welcomeEl.createDiv({ cls: "vc-examples" });
	const examplesTitle = examplesEl.createEl("p", { cls: "vc-examples-title" });
	examplesTitle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 6px;"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>Example questions:`;
	
	const examplesList = examplesEl.createEl("ul", { cls: "vc-examples-list" });
	const examples = [
		"Summarize this note and propose next steps.",
		"Create a new note in Research with this outline.",
		"Find related notes using my machine learning tag.",
		"Refactor this section to be more concise.",
		"Generate a monthly summary from recent notes.",
	];
	
	for (const example of examples) {
		examplesList.createEl("li", { text: example });
	}

	// Available capabilities section
	const capabilitiesEl = welcomeEl.createDiv({ cls: "vc-capabilities" });
	const capabilitiesTitle = capabilitiesEl.createEl("p", { cls: "vc-capabilities-title" });
	capabilitiesTitle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 6px;"><path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/></svg>Available capabilities:`;
	
	const capabilitiesList = capabilitiesEl.createEl("ul", { cls: "vc-capabilities-list" });
	const capabilities = [
		"Chat with GitHub Copilot",
		"Run skills for note operations",
		"Use MCP tools",
		"Analyze and transform your notes",
		"Generate or update content",
		"Work with your entire vault",
	];
	
	for (const capability of capabilities) {
		capabilitiesList.createEl("li", { text: capability });
	}

	// Slash commands section
	const commandsEl = welcomeEl.createDiv({ cls: "vc-commands" });
	const commandsTitle = commandsEl.createEl("p", { cls: "vc-commands-title" });
	commandsTitle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 6px;"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>Available commands:`;
	
	const commandsList = commandsEl.createEl("ul", { cls: "vc-commands-list" });
	const commands = [
		{ cmd: "/search", desc: "Search across all notes" },
		{ cmd: "/create", desc: "Create a new note" },
		{ cmd: "/daily", desc: "Open or create today's daily note" },
		{ cmd: "/recent", desc: "Show recently modified notes" },
		{ cmd: "/help", desc: "See all available commands" },
	];
	
	for (const { cmd, desc } of commands) {
		const li = commandsList.createEl("li");
		li.createEl("code", { text: cmd, cls: "vc-command-code" });
		li.appendText(` — ${desc}`);
	}
}

	/**
	 * Execute a tool directly (used by slash commands)
	 */
	async executeTool(toolName: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
		const service = this.copilotService as unknown as {
			readNote: (path: string) => Promise<Record<string, unknown>>;
			searchNotes: (query: string, limit: number) => Promise<Record<string, unknown>>;
			createNote: (path: string, content: string) => Promise<Record<string, unknown>>;
			getActiveNote: () => Promise<Record<string, unknown>>;
			listNotes: (folder?: string) => Promise<Record<string, unknown>>;
			appendToNote: (path: string, content: string) => Promise<Record<string, unknown>>;
			batchReadNotes: (paths: string[]) => Promise<Record<string, unknown>>;
			updateNote: (path: string, content: string) => Promise<Record<string, unknown>>;
			deleteNote: (path: string) => Promise<Record<string, unknown>>;
			getRecentChanges: (limit: number) => Promise<Record<string, unknown>>;
			getDailyNote: (date?: string) => Promise<Record<string, unknown>>;
			renameNote: (oldPath: string, newPath: string) => Promise<Record<string, unknown>>;
		};

		switch (toolName) {
			case "read_note":
				return await service.readNote(args.path as string);
			case "search_notes":
				return await service.searchNotes(args.query as string, (args.limit as number) || 10);
			case "create_note":
				return await service.createNote(args.path as string, args.content as string);
			case "get_active_note":
				return await service.getActiveNote();
			case "list_notes":
				return await service.listNotes(args.folder as string | undefined);
			case "append_to_note":
				return await service.appendToNote(args.path as string, args.content as string);
			case "batch_read_notes":
				return await service.batchReadNotes(args.paths as string[]);
			case "update_note":
				return await service.updateNote(args.path as string, args.content as string);
			case "delete_note":
				return await service.deleteNote(args.path as string);
			case "get_recent_changes":
				return await service.getRecentChanges((args.limit as number) || 10);
			case "get_daily_note":
				return await service.getDailyNote(args.date as string | undefined);
			case "rename_note":
				return await service.renameNote(args.oldPath as string, args.newPath as string);
			default:
				return { success: false, error: `Unknown tool: ${toolName}` };
		}
	}

	/**
	 * Clear chat history and UI
	 */
	async clearChat(): Promise<void> {
		await this.copilotService.clearHistory();
		this.messagesContainer.empty();
		this.addWelcomeMessage();
	}

	/**
	 * Handle slash command
	 */
	private async handleSlashCommand(message: string): Promise<boolean> {
		if (!message.startsWith("/")) return false;

		const match = message.match(/^\/(\w+)(?:\s+([\s\S]*))?$/);
		if (!match) return false;

		const [, commandName, args] = match;
		if (!commandName) return false;
		const command = SLASH_COMMANDS.find(c => c.name === commandName.toLowerCase());
		
		if (!command) {
			// Unknown command - show help
			await this.renderMessage({ role: "user", content: message, timestamp: new Date() });
			const helpMsg = `Unknown command: /${commandName}\n\nType **/help** to see available commands.`;
			await this.renderMessage({ role: "assistant", content: helpMsg, timestamp: new Date() });
			return true;
		}

		// Display user command
		await this.renderMessage({ role: "user", content: message, timestamp: new Date() });
		this.scrollToBottom();

		try {
			const result = await command.handler(this, args?.trim() || "");
			
			if (result) {
				// Create message element for the response
				const msgEl = this.createMessageElement("assistant", "");
				await this.renderMarkdownContent(msgEl, result);
				this.addCopyButton(msgEl);
			}
		} catch (error) {
			this.addErrorMessage(`Command failed: ${error}`);
		}

		return true;
	}

	private async sendMessage(): Promise<void> {
		const message = this.inputEl.value.trim();
		if (!message || this.isProcessing) return;

		this.isProcessing = true;
		this.updateUIState();

		// Clear input
		this.inputEl.value = "";
		this.autoResizeInput();

		// Ensure we have a session in our tracking system
		await this.ensureSessionExists();

		// Clear welcome message if present
		const welcomeEl = this.messagesContainer.querySelector(".vc-welcome");
		if (welcomeEl) {
			welcomeEl.remove();
		}

		// Check if this is a slash command
		if (message.startsWith("/")) {
			try {
				const handled = await this.handleSlashCommand(message);
				if (handled) {
					this.isProcessing = false;
					this.updateUIState();
					this.scrollToBottom();
					return;
				}
			} catch (error) {
				this.addErrorMessage(`Command error: ${error}`);
				this.isProcessing = false;
				this.updateUIState();
				return;
			}
		}

		// Build message with attached notes context
		let fullMessage = message;
		if (this.attachedNotes.length > 0) {
			const attachmentContext: string[] = [];
			for (const file of this.attachedNotes) {
				try {
					const content = await this.app.vault.cachedRead(file);
					attachmentContext.push(`--- Content of "${file.path}" ---\n${content}\n--- End of "${file.path}" ---`);
				} catch (e) {
					console.error(`Failed to read attached note: ${file.path}`, e);
				}
			}
			if (attachmentContext.length > 0) {
				fullMessage = `${attachmentContext.join("\n\n")}\n\nUser question about the above note(s):\n${message}`;
			}
		}

		// Display user message (without the full context for cleaner UI)
		const displayMessage = this.attachedNotes.length > 0
			? `[📎 ${this.attachedNotes.map(f => f.basename).join(", ")}]\n\n${message}`
			: message;
		
		await this.renderMessage({ role: "user", content: displayMessage, timestamp: new Date() });
		this.scrollToBottom();

		// Clear attachments after sending
		this.attachedNotes = [];
		this.renderAttachments();

		try {
			// Create streaming message element
			this.currentStreamingMessageEl = this.createMessageElement("assistant", "");
			this.scrollToBottom();

			if (this.plugin.settings.streaming) {
				await this.copilotService.sendMessageStreaming(
					fullMessage,
					(delta) => {
						if (this.currentStreamingMessageEl) {
							const contentEl = this.currentStreamingMessageEl.querySelector(".vc-message-content");
							if (contentEl) {
								contentEl.textContent += delta;
							}
						}
						this.scrollToBottom();
					},
					async (fullContent) => {
						// Render markdown when complete
						if (this.currentStreamingMessageEl) {
							await this.renderMarkdownContent(this.currentStreamingMessageEl, fullContent);
							this.addCopyButton(this.currentStreamingMessageEl);
						}
						this.currentStreamingMessageEl = null;
					}
				);
			} else {
				const response = await this.copilotService.sendMessage(fullMessage);
				if (this.currentStreamingMessageEl) {
					await this.renderMarkdownContent(this.currentStreamingMessageEl, response);
					this.addCopyButton(this.currentStreamingMessageEl);
				}
				this.currentStreamingMessageEl = null;
			}
		} catch (error) {
			new Notice(`Vault Copilot error: ${error}`);
			if (this.currentStreamingMessageEl) {
				this.currentStreamingMessageEl.remove();
				this.currentStreamingMessageEl = null;
			}
			this.addErrorMessage(String(error));
		} finally {
			// Auto-rename session based on first message
			await this.autoRenameSessionFromFirstMessage(message);
			
			this.isProcessing = false;
			this.updateUIState();
			this.scrollToBottom();
		}
	}

	/**
	 * Auto-rename session based on first user message
	 */
	private async autoRenameSessionFromFirstMessage(firstMessage: string): Promise<void> {
		const currentSession = this.plugin.settings.sessions.find(
			s => s.id === this.plugin.settings.activeSessionId
		);
		
		if (!currentSession) {
			console.log("[VC] No current session found for auto-rename");
			return;
		}
		
		// Only rename if this appears to be the default auto-generated name
		// (starts with "Chat " followed by a time)
		if (!currentSession.name.startsWith("Chat ")) {
			console.log("[VC] Session already has custom name:", currentSession.name);
			return;
		}
		
		// Check if this is the first user message by counting user messages
		const messageHistory = this.copilotService.getMessageHistory();
		const userMessageCount = messageHistory.filter(m => m.role === "user").length;
		console.log("[VC] User message count:", userMessageCount, "Total messages:", messageHistory.length);
		
		if (userMessageCount !== 1) {
			console.log("[VC] Not first user message, skipping rename");
			return;
		}
		
		// Generate a concise title from the first message
		const title = this.generateSessionTitle(firstMessage);
		console.log("[VC] Renaming session to:", title);
		
		// Update session name
		currentSession.name = title;
		await this.plugin.saveSettings();
		
		// Update UI
		this.updateHeaderTitle();
		if (this.sessionPanel) {
			this.sessionPanel.render();
		}
	}
	
	/**
	 * Generate a concise session title from a message (max ~50 chars)
	 */
	private generateSessionTitle(message: string): string {
		// Remove slash commands prefix if any
		let cleaned = message.replace(/^\/\w+\s*/, "").trim();
		
		// Remove common prefixes
		cleaned = cleaned.replace(/^(can you|could you|please|would you|help me|i want to|i need to)\s+/i, "");
		
		// Capitalize first letter
		cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
		
		// Truncate if too long (keep first ~47 chars + "...")
		if (cleaned.length > 50) {
			cleaned = cleaned.substring(0, 47).trim() + "...";
		}
		
		return cleaned;
	}

	private createMessageElement(role: "user" | "assistant", content: string): HTMLElement {
		const messageEl = this.messagesContainer.createDiv({ 
			cls: `vc-message vc-message-${role}` 
		});
		
		messageEl.createDiv({ cls: "vc-message-content", text: content });

		return messageEl;
	}

	private addCopyButton(messageEl: HTMLElement): void {
		const contentEl = messageEl.querySelector(".vc-message-content");
		if (!contentEl) return;

		const actionsEl = messageEl.createDiv({ cls: "vc-message-actions" });
		const copyBtn = actionsEl.createEl("button", { cls: "vc-copy-btn", attr: { "aria-label": "Copy to clipboard" } });
		copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
		copyBtn.addEventListener("click", async () => {
			// If text is highlighted, copy only the selection; otherwise copy whole block
			const selection = window.getSelection();
			let html = "";
			let text = "";
			if (selection && selection.rangeCount > 0 && selection.toString().trim()) {
				// Clone selection into a temp container
				const range = selection.getRangeAt(0);
				const tempDiv = document.createElement("div");
				tempDiv.appendChild(range.cloneContents());
				html = tempDiv.innerHTML;
				text = this.extractTextWithLinks(tempDiv);
			} else {
				html = (contentEl as HTMLElement).innerHTML;
				text = this.extractTextWithLinks(contentEl as HTMLElement);
			}
			
			try {
				// Copy both HTML (for rich paste) and plain text (markdown fallback)
				await navigator.clipboard.write([
					new ClipboardItem({
						"text/html": new Blob([html], { type: "text/html" }),
						"text/plain": new Blob([text], { type: "text/plain" })
					})
				]);
				new Notice("Copied to clipboard");
				copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
				setTimeout(() => {
					copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
				}, 2000);
			} catch {
				new Notice("Failed to copy");
			}
		});
	}

	private extractTextWithLinks(element: HTMLElement): string {
		let result = "";
		
		const processNode = (node: Node): void => {
			if (node.nodeType === Node.TEXT_NODE) {
				result += node.textContent || "";
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				const el = node as HTMLElement;
				const tagName = el.tagName.toLowerCase();
				
				if (tagName === "a") {
					const linkText = el.textContent || "";
					const href = el.getAttribute("href") || el.getAttribute("data-href") || "";
					
					// Check if it's an internal Obsidian link
					if (el.classList.contains("internal-link")) {
						result += `[[${href}]]`;
					} else if (href) {
						result += `[${linkText}](${href})`;
					} else {
						result += linkText;
					}
				} else if (tagName === "br") {
					result += "\n";
				} else if (tagName === "p") {
					for (const child of Array.from(el.childNodes)) {
						processNode(child);
					}
					result += "\n\n";
				} else if (tagName === "code" && el.parentElement?.tagName.toLowerCase() !== "pre") {
					result += "`" + (el.textContent || "") + "`";
				} else if (tagName === "pre") {
					const codeEl = el.querySelector("code");
					const lang = codeEl?.className.match(/language-(\w+)/)?.[1] || "";
					result += "```" + lang + "\n" + (el.textContent || "") + "\n```\n";
				} else if (tagName === "strong" || tagName === "b") {
					result += "**" + (el.textContent || "") + "**";
				} else if (tagName === "em" || tagName === "i") {
					result += "*" + (el.textContent || "") + "*";
				} else if (tagName === "li") {
					result += "- ";
					for (const child of Array.from(el.childNodes)) {
						processNode(child);
					}
					result += "\n";
				} else if (tagName === "h1" || tagName === "h2" || tagName === "h3" || tagName === "h4" || tagName === "h5" || tagName === "h6") {
					const level = parseInt(tagName.charAt(1), 10);
					result += "#".repeat(level) + " " + (el.textContent || "") + "\n\n";
				} else {
					for (const child of Array.from(el.childNodes)) {
						processNode(child);
					}
				}
			}
		};
		
		for (const child of Array.from(element.childNodes)) {
			processNode(child);
		}
		
		return result.trim();
	}

	private async renderMessage(message: ChatMessage): Promise<void> {
		const messageEl = this.createMessageElement(message.role, "");
		await this.renderMarkdownContent(messageEl, message.content);
		if (message.role === "assistant") {
			this.addCopyButton(messageEl);
		}
	}

	private async renderMarkdownContent(messageEl: HTMLElement, content: string): Promise<void> {
		const contentEl = messageEl.querySelector(".vc-message-content");
		if (contentEl) {
			contentEl.empty();
			await MarkdownRenderer.renderMarkdown(
				content,
				contentEl as HTMLElement,
				"",
				this.plugin
			);
			// Make internal links clickable
			this.registerInternalLinks(contentEl as HTMLElement);
		}
	}

	private registerInternalLinks(container: HTMLElement): void {
		// Handle internal links (data-href attribute set by MarkdownRenderer)
		const internalLinks = container.querySelectorAll("a.internal-link");
		internalLinks.forEach((link) => {
			link.addEventListener("click", (e) => {
				e.preventDefault();
				const href = link.getAttribute("data-href") || link.getAttribute("href");
				if (href) {
					this.app.workspace.openLinkText(href, "", false);
				}
			});
		});

		// Handle external links
		const externalLinks = container.querySelectorAll("a.external-link, a[href^='http']");
		externalLinks.forEach((link) => {
			link.addEventListener("click", (e) => {
				e.preventDefault();
				const href = link.getAttribute("href");
				if (href) {
					window.open(href, "_blank");
				}
			});
		});
	}

	private addErrorMessage(error: string): void {
		const errorEl = this.messagesContainer.createDiv({ cls: "vc-error" });
		errorEl.createEl("span", { text: `Error: ${error}` });
	}

	private handleSendOrCancel(): void {
		if (this.isProcessing) {
			this.cancelRequest();
		} else {
			this.sendMessage();
		}
	}

	private async cancelRequest(): Promise<void> {
		try {
			await this.copilotService.abort();
			if (this.currentStreamingMessageEl) {
				const contentEl = this.currentStreamingMessageEl.querySelector(".vc-message-content");
				if (contentEl && contentEl.textContent) {
					// Keep what was streamed, mark as cancelled
					contentEl.textContent += "\n\n*[Generation cancelled]*";
				} else {
					// Remove empty message
					this.currentStreamingMessageEl.remove();
				}
				this.currentStreamingMessageEl = null;
			}
			this.isProcessing = false;
			this.updateUIState();
			new Notice("Generation cancelled");
		} catch (error) {
			console.error("Failed to cancel:", error);
		}
	}

	private updateUIState(): void {
		this.inputEl.disabled = this.isProcessing;
		
		if (this.isProcessing) {
			this.sendButton.addClass("vc-loading");
			// Change to stop icon
			this.sendButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><rect x="9" y="9" width="6" height="6"></rect></svg>`;
			this.sendButton.setAttribute("aria-label", "Stop generation");
		} else {
			this.sendButton.removeClass("vc-loading");
			// Change back to send icon
			this.sendButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>`;
			this.sendButton.setAttribute("aria-label", "Send message");
		}
	}

	private autoResizeInput(): void {
		this.inputEl.style.height = "auto";
		const newHeight = Math.min(this.inputEl.scrollHeight, 200);
		this.inputEl.style.height = newHeight + "px";
	}

	/**
	 * Handle input changes to detect prompt picker trigger
	 */
	private handlePromptPickerInput(): void {
		const value = this.inputEl.value;
		
		// Check if the user is typing a prompt command (starts with /)
		if (value.startsWith('/') && !value.includes(' ')) {
			this.showPromptPicker();
			this.updatePromptPicker(value);
		} else {
			this.hidePromptPicker();
		}
	}

	/**
	 * Show the prompt picker dropdown
	 */
	private showPromptPicker(): void {
		if (!this.promptPickerEl) return;
		this.promptPickerVisible = true;
		this.promptPickerSelectedIndex = 0;
		this.promptPickerEl.style.display = "block";
	}

	/**
	 * Hide the prompt picker dropdown
	 */
	private hidePromptPicker(): void {
		if (!this.promptPickerEl) return;
		this.promptPickerVisible = false;
		this.promptPickerEl.style.display = "none";
	}

	/**
	 * Update the prompt picker with filtered prompts matching the query
	 */
	private updatePromptPicker(query: string): void {
		if (!this.promptPickerEl) return;
		
		// Get the search term (remove the leading /)
		const searchTerm = query.slice(1).toLowerCase();
		
		// Get prompts from cache
		const allPrompts = this.plugin.promptCache.getPrompts();
		
		// Also include built-in slash commands as "prompts"
		const builtInItems: CachedPromptInfo[] = SLASH_COMMANDS.map(cmd => ({
			name: cmd.name,
			description: cmd.description,
			path: `builtin:${cmd.name}`,
		}));
		
		// Combine and filter
		const allItems = [...builtInItems, ...allPrompts];
		this.filteredPrompts = allItems.filter(p => 
			p.name.toLowerCase().includes(searchTerm) ||
			p.description.toLowerCase().includes(searchTerm)
		);
		
		// Ensure selected index is within bounds
		this.promptPickerSelectedIndex = Math.min(
			this.promptPickerSelectedIndex,
			Math.max(0, this.filteredPrompts.length - 1)
		);
		
		// Render the picker
		this.renderPromptPicker();
	}

	/**
	 * Render the prompt picker dropdown
	 */
	private renderPromptPicker(): void {
		if (!this.promptPickerEl) return;
		this.promptPickerEl.empty();
		
		if (this.filteredPrompts.length === 0) {
			const emptyEl = this.promptPickerEl.createDiv({ cls: "vc-prompt-picker-empty" });
			emptyEl.setText("No prompts found");
			return;
		}
		
		// Add header
		const headerEl = this.promptPickerEl.createDiv({ cls: "vc-prompt-picker-header" });
		headerEl.setText("Select a prompt or command");
		
		// Add items
		this.filteredPrompts.forEach((prompt, index) => {
			const itemEl = this.promptPickerEl!.createDiv({ 
				cls: `vc-prompt-picker-item ${index === this.promptPickerSelectedIndex ? 'vc-selected' : ''}`
			});
			
			// Icon based on type
			const iconEl = itemEl.createDiv({ cls: "vc-prompt-picker-icon" });
			if (prompt.path.startsWith('builtin:')) {
				// Built-in command icon (terminal)
				iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>`;
			} else {
				// Custom prompt icon (file-text)
				iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`;
			}
			
			// Content
			const contentEl = itemEl.createDiv({ cls: "vc-prompt-picker-content" });
			contentEl.createDiv({ cls: "vc-prompt-picker-name", text: `/${prompt.name}` });
			contentEl.createDiv({ cls: "vc-prompt-picker-desc", text: prompt.description });
			
			// Click handler
			itemEl.addEventListener("click", () => {
				this.promptPickerSelectedIndex = index;
				this.selectPromptFromPicker();
			});
			
			// Hover handler
			itemEl.addEventListener("mouseenter", () => {
				this.promptPickerSelectedIndex = index;
				this.highlightPromptPickerItem();
			});
		});
	}

	/**
	 * Highlight the currently selected prompt picker item
	 */
	private highlightPromptPickerItem(): void {
		if (!this.promptPickerEl) return;
		
		const items = this.promptPickerEl.querySelectorAll(".vc-prompt-picker-item");
		items.forEach((item, index) => {
			if (index === this.promptPickerSelectedIndex) {
				item.addClass("vc-selected");
				// Scroll into view if needed
				(item as HTMLElement).scrollIntoView({ block: "nearest" });
			} else {
				item.removeClass("vc-selected");
			}
		});
	}

	/**
	 * Select the currently highlighted prompt from the picker
	 */
	private async selectPromptFromPicker(): Promise<void> {
		const selectedPrompt = this.filteredPrompts[this.promptPickerSelectedIndex];
		if (!selectedPrompt) {
			this.hidePromptPicker();
			return;
		}
		
		// Hide the picker
		this.hidePromptPicker();
		
		if (selectedPrompt.path.startsWith('builtin:')) {
			// It's a built-in slash command - just fill in the command name
			this.inputEl.value = `/${selectedPrompt.name} `;
			this.inputEl.focus();
			// Move cursor to end
			this.inputEl.selectionStart = this.inputEl.selectionEnd = this.inputEl.value.length;
		} else {
			// It's a custom prompt - execute it immediately
			await this.executePrompt(selectedPrompt);
		}
	}

	/**
	 * Execute a custom prompt (VS Code compatible)
	 */
	private async executePrompt(promptInfo: CachedPromptInfo): Promise<void> {
		// Clear the input
		this.inputEl.value = "";
		this.autoResizeInput();
		
		// Load the full prompt content
		const fullPrompt = await this.plugin.promptCache.getFullPrompt(promptInfo.name);
		if (!fullPrompt) {
			new Notice(`Could not load prompt: ${promptInfo.name}`);
			return;
		}
		
		// Ensure we have a session
		await this.ensureSessionExists();
		
		// Clear welcome message if present
		const welcomeEl = this.messagesContainer.querySelector(".vc-welcome");
		if (welcomeEl) {
			welcomeEl.remove();
		}
		
		// Display a user message showing which prompt was executed
		const userMessage = `Run prompt: **${promptInfo.name}**\n\n> ${promptInfo.description}`;
		await this.renderMessage({ role: "user", content: userMessage, timestamp: new Date() });
		this.scrollToBottom();
		
		// Log agent from frontmatter if specified (agent switching requires selecting before prompt)
		if (fullPrompt.agent) {
			const agent = this.plugin.agentCache.getAgentByName(fullPrompt.agent);
			if (agent) {
				console.log(`[VC] Prompt specifies agent: ${agent.name}`);
				// Note: To use this agent, select it from the agent dropdown before running the prompt
			} else {
				console.warn(`[VC] Agent "${fullPrompt.agent}" specified in prompt not found`);
			}
		}
		
		// Set processing state
		this.isProcessing = true;
		this.updateUIState();
		
		try {
			// Create streaming message element
			this.currentStreamingMessageEl = this.createMessageElement("assistant", "");
			this.scrollToBottom();
			
			// Process the prompt content with VS Code compatible variable replacement
			let content = await this.processPromptVariables(fullPrompt.content, fullPrompt.path);
			
			// Process Markdown file links - resolve and include referenced content
			content = await this.resolveMarkdownFileLinks(content, fullPrompt.path);
			
			// Process #tool:name references in the body
			content = this.processToolReferences(content, fullPrompt.tools);

			// Override model if specified in prompt
			const originalModel = this.plugin.settings.model;
			if (fullPrompt.model) {
				this.copilotService.updateConfig({ model: fullPrompt.model });
				console.log(`[VC] Prompt using model: ${fullPrompt.model}`);
			}

			if (this.plugin.settings.streaming) {
				await this.copilotService.sendMessageStreaming(
					content,
					(delta) => {
						if (this.currentStreamingMessageEl) {
							const contentEl = this.currentStreamingMessageEl.querySelector(".vc-message-content");
							if (contentEl) {
								contentEl.textContent += delta;
							}
						}
						this.scrollToBottom();
					},
					async (fullContent) => {
						if (this.currentStreamingMessageEl) {
							await this.renderMarkdownContent(this.currentStreamingMessageEl, fullContent);
							this.addCopyButton(this.currentStreamingMessageEl);
						}
						this.currentStreamingMessageEl = null;
					}
				);
			} else {
				const response = await this.copilotService.sendMessage(content);
				if (this.currentStreamingMessageEl) {
					await this.renderMarkdownContent(this.currentStreamingMessageEl, response);
					this.addCopyButton(this.currentStreamingMessageEl);
				}
				this.currentStreamingMessageEl = null;
			}

			// Restore original model if we changed it
			if (fullPrompt.model) {
				this.copilotService.updateConfig({ model: originalModel });
			}
		} catch (error) {
			new Notice(`Prompt execution error: ${error}`);
			if (this.currentStreamingMessageEl) {
				this.currentStreamingMessageEl.remove();
				this.currentStreamingMessageEl = null;
			}
			this.addErrorMessage(String(error));
		} finally {
			this.isProcessing = false;
			this.updateUIState();
			this.scrollToBottom();
		}
	}

	/**
	 * Process prompt variables using VS Code compatible ${var} syntax
	 */
	private async processPromptVariables(content: string, promptPath: string): Promise<string> {
		const activeFile = this.app.workspace.getActiveFile();
		const vaultPath = (this.app.vault.adapter as any).basePath || '';
		
		// VS Code compatible variables
		// File context variables
		if (activeFile) {
			// ${file} - Full path to the current file
			content = content.replace(/\$\{file\}/g, activeFile.path);
			
			// ${fileBasename} - Filename with extension
			content = content.replace(/\$\{fileBasename\}/g, activeFile.name);
			
			// ${fileDirname} - Directory of the current file
			const dirName = activeFile.parent?.path || '';
			content = content.replace(/\$\{fileDirname\}/g, dirName);
			
			// ${fileBasenameNoExtension} - Filename without extension
			content = content.replace(/\$\{fileBasenameNoExtension\}/g, activeFile.basename);
			
			// ${activeNoteContent} - Full content of active note (Obsidian-specific enhancement)
			if (content.includes('${activeNoteContent}')) {
				try {
					const noteContent = await this.app.vault.cachedRead(activeFile);
					content = content.replace(/\$\{activeNoteContent\}/g, noteContent);
				} catch {
					content = content.replace(/\$\{activeNoteContent\}/g, '[Could not read note content]');
				}
			}
		} else {
			content = content.replace(/\$\{file\}/g, '[No active file]');
			content = content.replace(/\$\{fileBasename\}/g, '[No active file]');
			content = content.replace(/\$\{fileDirname\}/g, '[No active file]');
			content = content.replace(/\$\{fileBasenameNoExtension\}/g, '[No active file]');
			content = content.replace(/\$\{activeNoteContent\}/g, '[No active file]');
		}
		
		// Workspace variables
		// ${workspaceFolder} - Path to the vault
		content = content.replace(/\$\{workspaceFolder\}/g, vaultPath);
		
		// ${workspaceFolderBasename} - Name of the vault
		const vaultName = this.app.vault.getName();
		content = content.replace(/\$\{workspaceFolderBasename\}/g, vaultName);
		
		// Selection variables
		// ${selection} / ${selectedText} - Currently selected text in the editor
		const activeView = this.app.workspace.getActiveViewOfType(ItemView);
		let selectedText = '';
		if (activeView && 'editor' in activeView) {
			const editor = (activeView as any).editor;
			if (editor && typeof editor.getSelection === 'function') {
				selectedText = editor.getSelection() || '';
			}
		}
		content = content.replace(/\$\{selection\}/g, selectedText || '[No selection]');
		content = content.replace(/\$\{selectedText\}/g, selectedText || '[No selection]');
		
		// Date/time variables (Obsidian-specific enhancements)
		const now = new Date();
		const dateStr = now.toISOString().split('T')[0] ?? now.toISOString();
		content = content.replace(/\$\{date\}/g, dateStr);
		content = content.replace(/\$\{time\}/g, now.toLocaleTimeString());
		content = content.replace(/\$\{datetime\}/g, now.toISOString());
		
		// Legacy support - also handle {var} syntax for backwards compatibility
		if (activeFile) {
			content = content.replace(/\{activeNote\}/g, activeFile.path);
			content = content.replace(/\{activeNoteName\}/g, activeFile.basename);
			if (content.includes('{activeNoteContent}')) {
				try {
					const noteContent = await this.app.vault.cachedRead(activeFile);
					content = content.replace(/\{activeNoteContent\}/g, noteContent);
				} catch {
					content = content.replace(/\{activeNoteContent\}/g, '[Could not read note content]');
				}
			}
		} else {
			content = content.replace(/\{activeNote\}/g, '[No active note]');
			content = content.replace(/\{activeNoteName\}/g, '[No active note]');
			content = content.replace(/\{activeNoteContent\}/g, '[No active note]');
		}
		content = content.replace(/\{date\}/g, dateStr);
		content = content.replace(/\{time\}/g, now.toLocaleTimeString());
		content = content.replace(/\{datetime\}/g, now.toISOString());
		
		return content;
	}

	/**
	 * Resolve Markdown file links and include referenced file content
	 * Supports [link text](relative/path.md) syntax
	 */
	private async resolveMarkdownFileLinks(content: string, promptPath: string): Promise<string> {
		// Match Markdown links: [text](path.md) or [text](path)
		const linkRegex = /\[([^\]]*)\]\(([^)]+\.md)\)/g;
		const matches = [...content.matchAll(linkRegex)];
		
		if (matches.length === 0) return content;
		
		// Get the directory of the prompt file for relative path resolution
		const promptDir = promptPath.substring(0, promptPath.lastIndexOf('/'));
		
		for (const match of matches) {
			const fullMatch = match[0];
			const linkText = match[1] || '';
			const linkPath = match[2];
			
			// Skip if no path captured
			if (!linkPath) continue;
			
			// Resolve relative path from prompt file location
			let resolvedPath: string = linkPath;
			if (!linkPath.startsWith('/')) {
				resolvedPath = promptDir ? `${promptDir}/${linkPath}` : linkPath;
			}
			
			// Normalize the path (handle ../ etc)
			resolvedPath = this.normalizePath(resolvedPath);
			
			// Try to read the linked file
			const linkedFile = this.app.vault.getAbstractFileByPath(resolvedPath);
			if (linkedFile instanceof TFile) {
				try {
					const linkedContent = await this.app.vault.cachedRead(linkedFile);
					// Replace the link with the file content, wrapped with context
					const replacement = `\n\n---\n**Referenced file: ${linkText || linkedFile.basename}** (${resolvedPath})\n\n${linkedContent}\n\n---\n`;
					content = content.replace(fullMatch, replacement);
				} catch (error) {
					console.warn(`[VC] Could not read linked file: ${resolvedPath}`, error);
					content = content.replace(fullMatch, `[Could not read: ${resolvedPath}]`);
				}
			} else {
				console.warn(`[VC] Linked file not found: ${resolvedPath}`);
				content = content.replace(fullMatch, `[File not found: ${resolvedPath}]`);
			}
		}
		
		return content;
	}

	/**
	 * Normalize a path by resolving ../ and ./ components
	 */
	private normalizePath(path: string): string {
		const parts = path.split('/').filter(p => p !== '.');
		const result: string[] = [];
		
		for (const part of parts) {
			if (part === '..') {
				result.pop();
			} else if (part) {
				result.push(part);
			}
		}
		
		return result.join('/');
	}

	/**
	 * Process #tool:name references in the prompt body
	 * This adds context about which tools are available for the prompt
	 */
	private processToolReferences(content: string, promptTools?: string[]): string {
		// Find all #tool:toolName references
		const toolRefRegex = /#tool:(\w+)/g;
		const matches = [...content.matchAll(toolRefRegex)];
		
		if (matches.length === 0) return content;
		
		// Collect unique tool names referenced in the body
		const referencedTools = new Set<string>();
		for (const match of matches) {
			if (match[1]) {
				referencedTools.add(match[1]);
			}
		}
		
		// Build tool context if tools are referenced
		if (referencedTools.size > 0) {
			const toolList = Array.from(referencedTools).join(', ');
			const toolContext = `\n\n[Tools referenced in this prompt: ${toolList}]\n`;
			
			// Append tool context at the end of the content
			content = content + toolContext;
			
			// Replace #tool:name with just the tool name for cleaner prompt
			content = content.replace(toolRefRegex, '`$1` tool');
		}
		
		// If prompt has tools specified in frontmatter, add that context too
		if (promptTools && promptTools.length > 0) {
			const availableTools = promptTools.join(', ');
			content = content + `\n[Available tools for this prompt: ${availableTools}]\n`;
		}
		
		return content;
	}

	private insertCodeBlock(): void {
		const start = this.inputEl.selectionStart;
		const end = this.inputEl.selectionEnd;
		const text = this.inputEl.value;
		const before = text.substring(0, start);
		const selected = text.substring(start, end);
		const after = text.substring(end);
		
		if (selected) {
			this.inputEl.value = before + "```\n" + selected + "\n```" + after;
		} else {
			this.inputEl.value = before + "```\n" + "\n```" + after;
			this.inputEl.selectionStart = this.inputEl.selectionEnd = start + 4;
		}
		this.inputEl.focus();
		this.autoResizeInput();
	}

	private scrollToBottom(): void {
		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}
}
