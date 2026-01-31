import { ItemView, WorkspaceLeaf, Notice, TFile, setIcon, Menu } from "obsidian";
import { CopilotService, ChatMessage } from "../../copilot/CopilotService";
import CopilotPlugin from "../../main";
import { AVAILABLE_MODELS, CopilotSession } from "../../settings";
import { SessionPanel } from "./SessionPanel";
import { CachedAgentInfo } from "../../copilot/AgentCache";
import { CachedPromptInfo } from "../../copilot/PromptCache";
import { ToolCatalog } from "../../copilot/ToolCatalog";
import { ToolPickerModal } from "./ToolPickerModal";
import { 
	McpAppContainer,
	UIResourceContent,
	ToolCallResult
} from "../mcp-apps";
import { SLASH_COMMANDS } from "./SlashCommands";
import { NoteSuggestModal } from "./NoteSuggestModal";
import { renderWelcomeMessage } from "./WelcomeMessage";
import { PromptPicker } from "./PromptPicker";
import { ContextPicker } from "./ContextPicker";
import { PromptProcessor } from "./PromptProcessor";
import { MessageRenderer, UsedReference } from "./MessageRenderer";
import { SessionManager } from "./SessionManager";
import { ToolExecutionRenderer } from "./ToolExecutionRenderer";
import { VoiceChatService, RecordingState } from "../../voice-chat";

export const COPILOT_VIEW_TYPE = "copilot-chat-view";

export class CopilotChatView extends ItemView {
	public plugin: CopilotPlugin;
	private copilotService: CopilotService;
	private messagesContainer: HTMLElement;
	private inputEl: HTMLDivElement;  // contenteditable div for inline chips
	private sendButton: HTMLButtonElement;
	private isProcessing = false;
	private currentStreamingMessageEl: HTMLElement | null = null;
	private attachedNotes: TFile[] = [];  // From "Add Context..." button
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
	private promptPicker: PromptPicker | null = null;
	private contextPickerEl: HTMLElement | null = null;
	private contextPicker: ContextPicker | null = null;
	private toolSelectorEl: HTMLButtonElement | null = null;
	private toolCatalog: ToolCatalog | null = null;
	private promptProcessor: PromptProcessor;
	private messageRenderer: MessageRenderer;
	private sessionManager: SessionManager;
	private toolExecutionRenderer: ToolExecutionRenderer;
	
	// Voice chat
	private voiceChatService: VoiceChatService | null = null;
	private voiceBtn: HTMLButtonElement | null = null;
	private voiceStateUnsubscribe: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: CopilotPlugin, copilotService: CopilotService) {
		super(leaf);
		this.plugin = plugin;
		this.copilotService = copilotService;
		this.toolCatalog = new ToolCatalog(plugin.skillRegistry, plugin.mcpManager);
		this.promptProcessor = new PromptProcessor(plugin.app);
		this.messageRenderer = new MessageRenderer(plugin.app, this);
		
		// Initialize SessionManager with callbacks
		this.sessionManager = new SessionManager(
			plugin.settings,
			copilotService,
			() => plugin.saveSettings(),
			{
				onSessionCreated: () => {
					// Clear input box and attachments
					if (this.inputEl) {
						this.inputEl.innerHTML = "";
						this.autoResizeInput();
					}
					this.attachedNotes = [];
				},
				onSessionLoaded: () => {},
				onHeaderUpdate: () => this.updateHeaderTitle(),
				onSessionPanelHide: () => {
					if (this.sessionPanelVisible) {
						this.toggleSessionPanel();
					}
				},
				onAgentReset: async () => {
					// Refresh agent cache to pick up any new agents
					await this.plugin.agentCache.refreshCache();
					this.selectedAgent = null;
					this.updateAgentSelectorText();
				},
				onClearUI: () => this.messagesContainer.empty(),
				onLoadMessages: () => this.loadMessages(),
				onShowWelcome: () => this.addWelcomeMessage(),
			}
		);
		
		// Initialize ToolExecutionRenderer with tool execution callback
		this.toolExecutionRenderer = new ToolExecutionRenderer(
			this,
			(toolName, args) => this.executeTool(toolName, args)
		);
		
		// Initialize VoiceChatService with settings
		const voiceSettings = this.plugin.settings.voice || {
			backend: 'openai-whisper',
			whisperServerUrl: 'http://127.0.0.1:8080',
			language: 'en-US',
			audioDeviceId: undefined,
		};
		const openaiSettings = this.plugin.settings.openai;
		this.voiceChatService = new VoiceChatService({
			backend: voiceSettings.backend,
			whisperServerUrl: voiceSettings.whisperServerUrl,
			language: voiceSettings.language,
			openaiApiKey: openaiSettings?.apiKey || undefined,
			openaiBaseUrl: openaiSettings?.baseURL || undefined,
			audioDeviceId: voiceSettings.audioDeviceId,
		});
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
		
		// Right side buttons container
		const headerActions = header.createDiv({ cls: "vc-header-actions" });
		
		// New session button (plus icon)
		const newSessionBtn = headerActions.createEl("button", {
			cls: "vc-header-btn",
			attr: { "aria-label": "New session" }
		});
		setIcon(newSessionBtn, "plus");
		newSessionBtn.addEventListener("click", () => this.createNewSession());

		// Settings menu button (gear icon)
		const settingsMenuBtn = headerActions.createEl("button", {
			cls: "vc-header-btn",
			attr: { "aria-label": "Settings menu" }
		});
		setIcon(settingsMenuBtn, "settings");
		settingsMenuBtn.addEventListener("click", (e) => this.showSettingsMenu(e));
		
		// Session toggle button
		this.sessionToggleBtnEl = headerActions.createEl("button", {
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

		// Main input wrapper (the box)
		const inputWrapper = inputArea.createDiv({ cls: "vc-input-wrapper" });
		
		// Context row - Add Context button and attachment chips in a row
		const contextRow = inputWrapper.createDiv({ cls: "vc-context-row" });
		
		const addContextBtn = contextRow.createEl("button", { 
			cls: "vc-add-context",
			attr: { "aria-label": "Add context from notes" }
		});
		addContextBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg><span>Add Context...</span>`;
		addContextBtn.addEventListener("click", () => this.openNotePicker());
		
		// Attachments container next to Add Context button (for "Add Context..." chips)
		this.attachmentsContainer = contextRow.createDiv({ cls: "vc-attachments" });
		
		// Contenteditable div for mixed text and inline chips
		this.inputEl = inputWrapper.createDiv({
			cls: "vc-input",
			attr: { 
				contenteditable: "true",
				"data-placeholder": "Ask Vault Copilot anything or type / for prompts"
			}
		}) as HTMLDivElement;
		
		// Context picker dropdown (hidden by default, shown when user types #)
		this.contextPickerEl = inputWrapper.createDiv({ cls: "vc-context-picker" });
		this.contextPickerEl.style.display = "none";
		
		// Prompt picker dropdown (hidden by default, shown when user types /)
		this.promptPickerEl = inputWrapper.createDiv({ cls: "vc-prompt-picker" });
		this.promptPickerEl.style.display = "none";
		
		// Subscribe to prompt cache changes
		this.promptCacheUnsubscribe = this.plugin.promptCache.onCacheChange(() => {
			// If picker is visible, refresh the list
			if (this.promptPicker?.isVisible()) {
				this.promptPicker.update(this.inputEl.innerText || "");
			}
		});

		// Bottom toolbar inside the input box
		const inputToolbar = inputWrapper.createDiv({ cls: "vc-input-toolbar" });
		
		// Left side icons
		const toolbarLeft = inputToolbar.createDiv({ cls: "vc-toolbar-left" });

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

		// Tools selector button
		this.toolSelectorEl = toolbarLeft.createEl("button", { 
			cls: "vc-tool-selector",
			attr: { "aria-label": "Select tools" }
		});
		this.updateToolSelectorText();
		
		this.toolSelectorEl.addEventListener("click", () => this.openToolPicker());
		
		// Right side icons
		const toolbarRight = inputToolbar.createDiv({ cls: "vc-toolbar-right" });
		
		// Voice button - wired up to VoiceChatService
		this.voiceBtn = toolbarRight.createEl("button", { 
			cls: "vc-toolbar-btn vc-voice-btn",
			attr: { "aria-label": "Voice input" }
		});
		this.updateVoiceButtonState('idle');
		this.voiceBtn.addEventListener("click", () => this.handleVoiceInput());
		
		// Subscribe to voice chat state changes
		if (this.voiceChatService) {
			this.voiceStateUnsubscribe = this.voiceChatService.on('stateChange', (state) => {
				this.updateVoiceButtonState(state);
			});
		}

		// Send button
		this.sendButton = toolbarRight.createEl("button", { 
			cls: "vc-send-btn",
			attr: { "aria-label": "Send message" }
		});
		this.sendButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>`;

		// Event listeners
		this.inputEl.addEventListener("keydown", (e) => {
			// Handle context picker navigation (for #)
			if (this.contextPicker?.handleKeyDown(e)) {
				return;
			}
			
			// Handle prompt picker navigation
			if (this.promptPicker?.handleKeyDown(e)) {
				return;
			}
			
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		});

		this.inputEl.addEventListener("input", () => {
			this.autoResizeInput();
			this.promptPicker?.handleInput();
			this.contextPicker?.handleInput();
		});

		// Initialize pickers after textarea is created
		if (this.promptPickerEl) {
			this.promptPicker = new PromptPicker({
				containerEl: this.promptPickerEl,
				inputEl: this.inputEl,
				getPrompts: () => this.plugin.promptCache.getPrompts(),
				onSelect: (prompt) => this.executePrompt(prompt),
			});
		}

		if (this.contextPickerEl) {
			this.contextPicker = new ContextPicker({
				containerEl: this.contextPickerEl,
				inputEl: this.inputEl,
				getFiles: () => this.app.vault.getMarkdownFiles(),
				onSelect: (file) => this.insertInlineChip(file),
			});
		}

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

	/**
	 * Handle voice input button click
	 */
	private async handleVoiceInput(): Promise<void> {
		if (!this.voiceChatService) {
			console.error('Voice input is not available');
			return;
		}

		const state = this.voiceChatService.getState();
		console.log('VoiceInput: Current state:', state);

		if (state === 'recording') {
			// Stop recording and transcribe
			try {
				const result = await this.voiceChatService.stopRecording();
				console.log('VoiceInput: Got result:', result);
				if (result.text) {
					// Insert transcribed text into input
					this.insertTextAtCursor(result.text);
				} else {
					console.log('VoiceInput: No text in result');
				}
			} catch (error) {
				console.error('Voice transcription failed:', error);
			}
		} else if (state === 'idle' || state === 'error') {
			// Start recording
			try {
				await this.voiceChatService.startRecording();
			} catch (error) {
				console.error('Failed to start recording:', error);
			}
		}
		// If processing, do nothing (wait for it to complete)
	}

	/**
	 * Insert text at the current cursor position in the input
	 */
	private insertTextAtCursor(text: string): void {
		console.log('insertTextAtCursor: Inserting text:', text);
		
		// Get existing text and append new text
		const existingText = this.inputEl.textContent || '';
		const newText = existingText ? existingText + ' ' + text : text;
		this.inputEl.textContent = newText;
		
		// Move cursor to end
		const range = document.createRange();
		const selection = window.getSelection();
		range.selectNodeContents(this.inputEl);
		range.collapse(false);
		if (selection) {
			selection.removeAllRanges();
			selection.addRange(range);
		}
		
		this.autoResizeInput();
		this.inputEl.focus();
		console.log('insertTextAtCursor: Done, input now contains:', this.inputEl.textContent);
	}

	/**
	 * Update the voice button visual state based on recording state
	 */
	private updateVoiceButtonState(state: RecordingState): void {
		if (!this.voiceBtn) return;

		// Remove all state classes
		this.voiceBtn.removeClass('vc-voice-recording', 'vc-voice-processing', 'vc-voice-error');

		// Update icon and state
		switch (state) {
			case 'recording':
				this.voiceBtn.addClass('vc-voice-recording');
				this.voiceBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>`;
				this.voiceBtn.setAttribute('aria-label', 'Stop recording');
				break;
			case 'processing':
				this.voiceBtn.addClass('vc-voice-processing');
				this.voiceBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"></path><path d="M12 18v4"></path><path d="m4.93 4.93 2.83 2.83"></path><path d="m16.24 16.24 2.83 2.83"></path><path d="M2 12h4"></path><path d="M18 12h4"></path><path d="m4.93 19.07 2.83-2.83"></path><path d="m16.24 7.76 2.83-2.83"></path></svg>`;
				this.voiceBtn.setAttribute('aria-label', 'Processing...');
				break;
			case 'error':
				this.voiceBtn.addClass('vc-voice-error');
				// Fall through to idle icon
			case 'idle':
			default:
				this.voiceBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>`;
				this.voiceBtn.setAttribute('aria-label', 'Voice input');
				break;
		}
	}

	private async startService(): Promise<void> {
		try {
			if (!this.copilotService.isConnected()) {
				await this.copilotService.start();
				// Create session to load instructions, agents, and tools
				await this.copilotService.createSession();
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
	 * Update the tool selector button text with summary
	 */
	private updateToolSelectorText(): void {
		if (!this.toolSelectorEl || !this.toolCatalog) return;
		
		const currentSession = this.getCurrentSession();
		const summary = this.toolCatalog.getToolsSummary(this.plugin.settings, currentSession);
		
		// Show tools icon with tooltip showing count
		this.toolSelectorEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;
		this.toolSelectorEl.setAttribute("aria-label", `Tools ${summary.enabled}/${summary.total}`);
		
		// Add visual indicator if not all tools enabled
		if (summary.enabled < summary.total) {
			this.toolSelectorEl.addClass("vc-tools-filtered");
		} else {
			this.toolSelectorEl.removeClass("vc-tools-filtered");
		}
	}

	/**
	 * Get the current session object (delegates to SessionManager)
	 */
	private getCurrentSession(): CopilotSession | undefined {
		return this.sessionManager.getCurrentSession();
	}

	/**
	 * Open the tool picker modal
	 */
	private openToolPicker(): void {
		if (!this.toolCatalog) return;

		const currentSession = this.getCurrentSession();

		new ToolPickerModal(this.app, {
			toolCatalog: this.toolCatalog,
			settings: this.plugin.settings,
			session: currentSession,
			mode: "session",
			onSave: async (enabledTools) => {
				// Save to current session
				if (currentSession) {
					currentSession.toolOverrides = {
						enabled: enabledTools,
					};
					await this.plugin.saveSettings();
					
					// Recreate the Copilot session with updated tools
					await this.copilotService.createSession();
				}
				
				// Update UI
				this.updateToolSelectorText();
			}
		}).open();
	}

	/**
	 * Show the settings menu dropdown
	 */
	private showSettingsMenu(e: Event): void {
		const menu = new Menu();

		// Custom Agents
		menu.addItem((item) => {
			item.setTitle("Custom Agents")
				.setIcon("bot")
				.onClick(() => {
					// Open settings to agent directories section
					(this.app as any).setting.open();
					(this.app as any).setting.openTabById("obsidian-vault-copilot");
				});
		});

		// Prompt Files
		menu.addItem((item) => {
			item.setTitle("Prompt Files")
				.setIcon("file-text")
				.onClick(() => {
					(this.app as any).setting.open();
					(this.app as any).setting.openTabById("obsidian-vault-copilot");
				});
		});

		menu.addSeparator();

		// Skills
		menu.addItem((item) => {
			item.setTitle("Skills")
				.setIcon("sparkles")
				.onClick(() => {
					(this.app as any).setting.open();
					(this.app as any).setting.openTabById("obsidian-vault-copilot");
				});
		});

		// Chat Instructions
		menu.addItem((item) => {
			item.setTitle("Chat Instructions")
				.setIcon("scroll-text")
				.onClick(() => {
					(this.app as any).setting.open();
					(this.app as any).setting.openTabById("obsidian-vault-copilot");
				});
		});

		// Generate Chat Instructions
		menu.addItem((item) => {
			item.setTitle("Generate Chat Instructions")
				.setIcon("wand")
				.onClick(async () => {
					new Notice("Generating chat instructions...");
					// TODO: Implement chat instructions generation
				});
		});

		menu.addSeparator();

		// MCP Servers
		menu.addItem((item) => {
			item.setTitle("MCP Servers")
				.setIcon("server")
				.onClick(() => {
					(this.app as any).setting.open();
					(this.app as any).setting.openTabById("obsidian-vault-copilot");
				});
		});

		// Tool Sets
		menu.addItem((item) => {
			item.setTitle("Tool Sets")
				.setIcon("wrench")
				.onClick(() => {
					this.openToolPicker();
				});
		});

		menu.addSeparator();

		// Diagnostics
		menu.addItem((item) => {
			item.setTitle("Diagnostics")
				.setIcon("activity")
				.onClick(() => {
					// Show diagnostics info
					this.showDiagnostics();
				});
		});

		// Chat Settings
		menu.addItem((item) => {
			item.setTitle("Chat Settings")
				.setIcon("settings")
				.onClick(() => {
					(this.app as any).setting.open();
					(this.app as any).setting.openTabById("obsidian-vault-copilot");
				});
		});

		menu.showAtMouseEvent(e as MouseEvent);
	}

	/**
	 * Show diagnostics information
	 */
	private showDiagnostics(): void {
		const diagnostics: string[] = [];
		
		// Service status
		diagnostics.push(`**Service Status:** ${this.copilotService.isConnected() ? "Connected" : "Disconnected"}`);
		diagnostics.push(`**Model:** ${this.plugin.settings.model}`);
		diagnostics.push(`**Streaming:** ${this.plugin.settings.streaming ? "Enabled" : "Disabled"}`);
		
		// Session info
		const session = this.getCurrentSession();
		if (session) {
			diagnostics.push(`\n**Session:** ${session.name}`);
			diagnostics.push(`**Messages:** ${session.messages?.length || 0}`);
		}
		
		// Tools
		if (this.toolCatalog) {
			const tools = this.toolCatalog.getAllTools();
			diagnostics.push(`\n**Available Tools:** ${tools.length}`);
		}
		
		// Configuration directories
		diagnostics.push(`\n**Agent Directories:** ${this.plugin.settings.agentDirectories.length}`);
		diagnostics.push(`**Prompt Directories:** ${this.plugin.settings.promptDirectories.length}`);
		diagnostics.push(`**Skill Directories:** ${this.plugin.settings.skillDirectories.length}`);
		
		new Notice(diagnostics.join("\n"), 10000);
	}

	/**
	 * Create a new chat session (delegates to SessionManager)
	 */
	async createNewSession(name?: string): Promise<void> {
		await this.sessionManager.createNewSession(name);
		this.renderAttachments();
	}

	/**
	 * Load a session by its data (delegates to SessionManager)
	 */
	async loadSession(session: CopilotSession): Promise<void> {
		await this.sessionManager.loadSession(session);
	}

	/**
	 * Save the current session's messages (delegates to SessionManager)
	 */
	async saveCurrentSession(): Promise<void> {
		await this.sessionManager.saveCurrentSession();
	}

	/**
	 * Ensure a session exists in our tracking system before sending messages (delegates to SessionManager)
	 */
	private async ensureSessionExists(): Promise<void> {
		await this.sessionManager.ensureSessionExists();
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
			return;
		}
		
		this.attachedNotes.push(file);
		this.renderAttachments();
	}

	private removeAttachment(file: TFile): void {
		this.attachedNotes = this.attachedNotes.filter(n => n.path !== file.path);
		this.renderAttachments();
	}

	private renderAttachments(): void {
		if (!this.attachmentsContainer) return;
		
		this.attachmentsContainer.empty();
		
		for (const file of this.attachedNotes) {
			const chip = this.attachmentsContainer.createSpan({ cls: "vc-attachment-chip" });
			
			const icon = chip.createSpan({ cls: "vc-attachment-icon" });
			icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
			
			chip.createSpan({ text: file.basename, cls: "vc-attachment-name" });
			
			const removeBtn = chip.createSpan({ cls: "vc-attachment-remove" });
			removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
			removeBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.removeAttachment(file);
			});
		}
	}

	/**
	 * Insert an inline chip at the current cursor position inside the contenteditable input
	 */
	private insertInlineChip(file: TFile): void {
		// Create the chip element
		const chip = document.createElement("span");
		chip.className = "vc-inline-chip";
		chip.contentEditable = "false";  // Make the chip non-editable as a unit
		chip.setAttribute("data-file-path", file.path);
		
		const icon = document.createElement("span");
		icon.className = "vc-attachment-icon";
		icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
		chip.appendChild(icon);
		
		const name = document.createElement("span");
		name.className = "vc-attachment-name";
		name.textContent = file.basename;
		chip.appendChild(name);
		
		const removeBtn = document.createElement("span");
		removeBtn.className = "vc-attachment-remove";
		removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
		removeBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			chip.remove();
			this.inputEl.focus();
		});
		chip.appendChild(removeBtn);
		
		// Insert at cursor position
		const selection = window.getSelection();
		if (selection && selection.rangeCount > 0) {
			const range = selection.getRangeAt(0);
			
			// Only insert if cursor is within our input element
			if (this.inputEl.contains(range.commonAncestorContainer)) {
				range.deleteContents();
				range.insertNode(chip);
				
				// Add a space after the chip and move cursor there
				const space = document.createTextNode(" ");
				range.setStartAfter(chip);
				range.insertNode(space);
				range.setStartAfter(space);
				range.setEndAfter(space);
				selection.removeAllRanges();
				selection.addRange(range);
			} else {
				// Cursor not in input, append at end
				this.inputEl.appendChild(chip);
				this.inputEl.appendChild(document.createTextNode(" "));
			}
		} else {
			// No selection, append at end
			this.inputEl.appendChild(chip);
			this.inputEl.appendChild(document.createTextNode(" "));
		}
		
		this.autoResizeInput();
		this.inputEl.focus();
	}
	
	/**
	 * Extract text and inline chips from the contenteditable input
	 * Returns the plain text message and array of file paths from chips
	 */
	private extractInputContent(): { text: string; chipFilePaths: string[] } {
		const chipFilePaths: string[] = [];
		let text = "";
		
		const extractFromNode = (node: Node) => {
			if (node.nodeType === Node.TEXT_NODE) {
				text += node.textContent || "";
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				const element = node as HTMLElement;
				if (element.classList.contains("vc-inline-chip")) {
					// It's a chip - add the file path and represent as [[filename]]
					const filePath = element.getAttribute("data-file-path");
					if (filePath) {
						chipFilePaths.push(filePath);
						// Add inline reference notation to the text
						const name = element.querySelector(".vc-attachment-name")?.textContent || "";
						text += `[[${name}]]`;
					}
				} else if (element.tagName === "BR") {
					text += "\n";
				} else {
					// Recurse into children
					node.childNodes.forEach(extractFromNode);
				}
			}
		};
		
		this.inputEl.childNodes.forEach(extractFromNode);
		
		return { text: text.trim(), chipFilePaths };
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
		// Unsubscribe from voice state changes and destroy service
		if (this.voiceStateUnsubscribe) {
			this.voiceStateUnsubscribe();
			this.voiceStateUnsubscribe = null;
		}
		if (this.voiceChatService) {
			this.voiceChatService.destroy();
			this.voiceChatService = null;
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
		renderWelcomeMessage(this.messagesContainer, (text) => {
			this.inputEl.innerText = text;
			this.sendMessage();
		});
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

		const match = message.match(/^\/([\w-]+)(?:\s+([\s\S]*))?$/);
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
		
		// Scroll the new user message to the top of the visible area
		const userMsgEl = this.messagesContainer.lastElementChild as HTMLElement;
		if (userMsgEl) {
			this.scrollMessageToTop(userMsgEl);
		}

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
		// Extract text and inline chip file paths from contenteditable
		const { text: message, chipFilePaths } = this.extractInputContent();
		if (!message || this.isProcessing) return;

		this.isProcessing = true;
		this.updateUIState();

		// Clear input
		this.inputEl.innerHTML = "";
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

		// Process #fetch URL references
		const { processedMessage, fetchedUrls, fetchedContext } = await this.promptProcessor.processFetchReferences(message, this.copilotService);

		// Extract and process [[filename]] inline references
		const inlineNoteRefs = this.extractInlineNoteReferences(processedMessage);
		const inlineNoteContext: string[] = [];
		const loadedInlineNotes: string[] = [];
		for (const noteName of inlineNoteRefs) {
			const file = this.app.metadataCache.getFirstLinkpathDest(noteName, "");
			if (file) {
				try {
					const content = await this.app.vault.cachedRead(file);
					inlineNoteContext.push(`--- Content of "${file.path}" ---\n${content}\n--- End of "${file.path}" ---`);
					loadedInlineNotes.push(file.basename);
				} catch (e) {
					console.error(`Failed to read inline note reference: ${noteName}`, e);
				}
			}
		}

		// Build message with attached notes context
		let fullMessage = processedMessage;
		
		// Add fetched web page content as context
		if (fetchedContext.length > 0) {
			fullMessage = `${fetchedContext.join("\n\n")}\n\n${fullMessage}`;
		}

		// Add inline [[note]] reference content as context
		if (inlineNoteContext.length > 0) {
			fullMessage = `${inlineNoteContext.join("\n\n")}\n\n${fullMessage}`;
		}

		// Add inline chip note refs (from # picker) as context
		const chipFileNames: string[] = [];
		if (chipFilePaths.length > 0) {
			const inlineRefContext: string[] = [];
			for (const filePath of chipFilePaths) {
				const file = this.app.vault.getAbstractFileByPath(filePath);
				if (file instanceof TFile) {
					try {
						const content = await this.app.vault.cachedRead(file);
						inlineRefContext.push(`--- Content of "${file.path}" ---\n${content}\n--- End of "${file.path}" ---`);
						chipFileNames.push(file.basename);
					} catch (e) {
						console.error(`Failed to read inline note ref: ${file.path}`, e);
					}
				}
			}
			if (inlineRefContext.length > 0) {
				fullMessage = `${inlineRefContext.join("\n\n")}\n\n${fullMessage}`;
			}
		}
		
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
				fullMessage = `${attachmentContext.join("\n\n")}\n\nUser question about the above note(s):\n${processedMessage}`;
			}
		}

		// Collect all used references for display
		const usedReferences: UsedReference[] = [];
		
		// Add selected agent as a reference
		if (this.selectedAgent) {
			usedReferences.push({
				type: "agent",
				name: this.selectedAgent.name,
				path: this.selectedAgent.path
			});
		}
		
		// Add loaded instructions as references
		const loadedInstructions = this.copilotService.getLoadedInstructions();
		for (const instruction of loadedInstructions) {
			usedReferences.push({
				type: "instruction",
				name: instruction.name,
				path: instruction.path
			});
		}
		
		// Add fetched URLs as references
		for (const url of fetchedUrls) {
			usedReferences.push({
				type: "url",
				name: new URL(url).hostname,
				path: url
			});
		}
		
		// Add inline [[note]] references as context
		for (let i = 0; i < loadedInlineNotes.length; i++) {
			const noteName = loadedInlineNotes[i];
			const noteRef = inlineNoteRefs[i];
			const file = this.app.metadataCache.getFirstLinkpathDest(noteRef || "", "");
			usedReferences.push({
				type: "context",
				name: noteName || noteRef || "Unknown",
				path: file?.path || noteRef || ""
			});
		}
		
		// Add chip file references as context
		for (let i = 0; i < chipFileNames.length; i++) {
			usedReferences.push({
				type: "context",
				name: chipFileNames[i] || "Unknown",
				path: chipFilePaths[i] || ""
			});
		}
		
		// Add attached notes as context
		for (const file of this.attachedNotes) {
			usedReferences.push({
				type: "context",
				name: file.basename,
				path: file.path
			});
		}

		// Display user message (clean, without prefixes)
		const userMessageEl = await this.renderMessage({ role: "user", content: processedMessage, timestamp: new Date() });
		
		// Render collapsible references section after the user message
		if (usedReferences.length > 0) {
			this.messageRenderer.renderUsedReferences(this.messagesContainer, usedReferences);
		}

		// Clear attachments after sending
		this.attachedNotes = [];
		this.renderAttachments();

		try {
			// Create streaming message element
			this.currentStreamingMessageEl = this.createMessageElement("assistant", "");
			
			// Scroll the new user message to the top AFTER creating streaming element
			// This ensures any auto-scroll from element creation is overwritten
			if (userMessageEl) {
				requestAnimationFrame(() => {
					this.scrollMessageToTop(userMessageEl);
				});
			}

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
						// Don't auto-scroll during streaming - keep user's question at top
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
			// Don't scroll to bottom - keep user's question visible at top
		}
	}

	/**
	 * Auto-rename session based on first user message (delegates to SessionManager)
	 */
	private async autoRenameSessionFromFirstMessage(firstMessage: string): Promise<void> {
		await this.sessionManager.autoRenameSessionFromFirstMessage(
			firstMessage,
			this.sessionPanel ? () => this.sessionPanel!.render() : undefined
		);
	}

	private createMessageElement(role: "user" | "assistant", content: string): HTMLElement {
		return this.messageRenderer!.createMessageElement(this.messagesContainer, role, content);
	}

	private addCopyButton(messageEl: HTMLElement): void {
		this.messageRenderer!.addCopyButton(messageEl);
	}

	private async renderMessage(message: ChatMessage): Promise<HTMLElement> {
		return await this.messageRenderer!.renderMessage(this.messagesContainer, message);
	}

	private async renderMarkdownContent(messageEl: HTMLElement, content: string): Promise<void> {
		await this.messageRenderer!.renderMarkdownContent(messageEl, content);
	}

	/**
	 * Render an MCP App inline in the chat (delegates to ToolExecutionRenderer)
	 * 
	 * @param containerEl - The container element to render the app into
	 * @param resource - The UI resource content (HTML)
	 * @param toolInfo - Optional tool information for context
	 * @returns The McpAppContainer component instance
	 */
	renderMcpApp(
		containerEl: HTMLElement,
		resource: UIResourceContent,
		toolInfo?: { id?: string | number; tool: { name: string; description: string } }
	): McpAppContainer {
		return this.toolExecutionRenderer.renderMcpApp(containerEl, resource, toolInfo);
	}

	/**
	 * Render a tool execution indicator with optional MCP App UI (delegates to ToolExecutionRenderer)
	 * 
	 * @param toolName - The name of the tool being executed
	 * @param toolArgs - The arguments passed to the tool
	 * @param uiResourceUri - Optional URI to a UI resource for rendering results
	 */
	renderToolExecution(
		toolName: string,
		toolArgs: Record<string, unknown>,
		uiResourceUri?: string
	): HTMLElement {
		const el = this.toolExecutionRenderer.renderToolExecution(
			this.messagesContainer,
			toolName,
			toolArgs,
			uiResourceUri
		);
		this.scrollToBottom();
		return el;
	}

	/**
	 * Update a tool execution indicator with the result (delegates to ToolExecutionRenderer)
	 * 
	 * @param containerEl - The tool execution container element
	 * @param result - The tool result
	 * @param uiResource - Optional UI resource for rendering the result
	 */
	async updateToolExecutionComplete(
		containerEl: HTMLElement,
		result: ToolCallResult,
		uiResource?: UIResourceContent
	): Promise<void> {
		await this.toolExecutionRenderer.updateToolExecutionComplete(
			this.messagesContainer,
			containerEl,
			result,
			uiResource
		);
		this.scrollToBottom();
	}

	/**
	 * Create a sample MCP App for testing/demonstration (delegates to ToolExecutionRenderer)
	 * This renders a simple HTML app inline
	 */
	renderSampleMcpApp(): void {
		this.toolExecutionRenderer.renderSampleMcpApp(this.messagesContainer);
		this.scrollToBottom();
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
		// Toggle contenteditable based on processing state
		this.inputEl.contentEditable = this.isProcessing ? "false" : "true";
		
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
	 * Execute a custom prompt (VS Code compatible)
	 */
	private async executePrompt(promptInfo: CachedPromptInfo): Promise<void> {
		// Clear the input
		this.inputEl.innerHTML = "";
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
		
		// Scroll the new user message to the top of the visible area
		const promptUserMsgEl = this.messagesContainer.lastElementChild as HTMLElement;
		if (promptUserMsgEl) {
			this.scrollMessageToTop(promptUserMsgEl);
		}
		
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
			let content = await this.promptProcessor.processVariables(fullPrompt.content, fullPrompt.path);
			
			// Process Markdown file links - resolve and include referenced content
			content = await this.promptProcessor.resolveMarkdownFileLinks(content, fullPrompt.path);
			
			// Process #tool:name references in the body
			content = this.promptProcessor.processToolReferences(content, fullPrompt.tools);

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

	private insertCodeBlock(): void {
		// For contenteditable, insert code block at cursor position
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			// No selection, append at end
			const codeBlock = document.createTextNode("```\n\n```");
			this.inputEl.appendChild(codeBlock);
		} else {
			const range = selection.getRangeAt(0);
			if (this.inputEl.contains(range.commonAncestorContainer)) {
				const selectedText = range.toString();
				range.deleteContents();
				const codeText = selectedText ? 
					`\`\`\`\n${selectedText}\n\`\`\`` :
					"```\n\n```";
				const codeBlock = document.createTextNode(codeText);
				range.insertNode(codeBlock);
				
				// Move cursor inside the code block if empty
				if (!selectedText) {
					range.setStart(codeBlock, 4);
					range.collapse(true);
					selection.removeAllRanges();
					selection.addRange(range);
				}
			}
		}
		this.inputEl.focus();
		this.autoResizeInput();
	}

	/**
	 * Extract [[filename]] inline note references from a message
	 * Returns array of note names (without the brackets)
	 */
	private extractInlineNoteReferences(message: string): string[] {
		const noteRefs: string[] = [];
		const regex = /\[\[([^\]]+)\]\]/g;
		let match;
		while ((match = regex.exec(message)) !== null) {
			// Get the note name, handling aliases like [[note|alias]]
			const fullRef = match[1];
			if (fullRef) {
				const noteName = fullRef.split("|")[0]?.trim();
				if (noteName && !noteRefs.includes(noteName)) {
					noteRefs.push(noteName);
				}
			}
		}
		return noteRefs;
	}

	private scrollToBottom(): void {
		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}

	/**
	 * Scroll so that the given message element appears at the top of the visible area.
	 * This creates the effect of "clearing the page" while keeping history below.
	 */
	private scrollMessageToTop(messageEl: HTMLElement): void {
		// Get the element's position relative to the scroll container
		const containerRect = this.messagesContainer.getBoundingClientRect();
		const messageRect = messageEl.getBoundingClientRect();
		
		// Calculate how much to scroll: current scroll + message position relative to container top
		const scrollAmount = this.messagesContainer.scrollTop + (messageRect.top - containerRect.top);
		this.messagesContainer.scrollTop = scrollAmount;
	}
}
