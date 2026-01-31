import { App, PluginSettingTab, Setting, Notice, FileSystemAdapter } from "obsidian";
import CopilotPlugin from "./main";
import { CliManager, CliStatus } from "./copilot/CliManager";
import { SkillInfo, SkillRegistryEvent, McpServerConfig } from "./copilot/SkillRegistry";
import { ChatMessage } from "./copilot/CopilotService";
import { DiscoveredMcpServer, isStdioConfig, McpConnectionStatus, McpServerSource } from "./copilot/McpTypes";
import { getSourceLabel, getSourceIcon } from "./copilot/McpManager";
import { ToolCatalog } from "./copilot/ToolCatalog";
import { ToolPickerModal } from "./ui/ChatView";
import { AIProviderType, getOpenAIApiKey } from "./copilot/AIProvider";
import { OpenAIService } from "./copilot/OpenAIService";

// Robot mascot logo (base64 encoded PNG, 48x48)
const COPILOT_LOGO_DATA_URL = "data:image/png;base64,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";

export interface CopilotSession {
	id: string;
	name: string;
	createdAt: number;
	lastUsedAt: number;
	completedAt?: number;
	durationMs?: number;
	archived: boolean;
	messages: ChatMessage[];
	/** Per-session tool overrides (enabled tools list, or undefined for defaults) */
	toolOverrides?: {
		/** If set, only these tools are enabled for this session */
		enabled?: string[];
		/** If set, these tools are disabled for this session */
		disabled?: string[];
	};
}

export interface OpenAISettings {
	/** Whether OpenAI is enabled */
	enabled: boolean;
	/** OpenAI API key (optional if OPENAI_API_KEY env var is set) */
	apiKey: string;
	/** OpenAI model to use */
	model: string;
	/** Base URL for OpenAI API (optional, for Azure or custom endpoints) */
	baseURL: string;
	/** Organization ID (optional) */
	organization: string;
	/** Max tokens for completion */
	maxTokens: number;
	/** Temperature (0-2) */
	temperature: number;
}

export interface CopilotPluginSettings {
	/** AI provider to use: 'copilot' or 'openai' */
	aiProvider: AIProviderType;
	model: string;
	cliPath: string;
	cliUrl: string;
	streaming: boolean;
	showInStatusBar: boolean;
	sessions: CopilotSession[];
	activeSessionId: string | null;
	/** Directories containing skill definition files */
	skillDirectories: string[];
	/** Directories containing custom agent definition files */
	agentDirectories: string[];
	/** Directories containing instruction files */
	instructionDirectories: string[];
	/** Directories containing prompt files */
	promptDirectories: string[];
	/** Default enabled tools (builtin tools enabled by default, MCP disabled by default) */
	defaultEnabledTools?: string[];
	/** Default disabled tools */
	defaultDisabledTools?: string[];
	/** Voice chat settings */
	voice?: {
		/** Voice backend: 'openai-whisper' or 'local-whisper' */
		backend: 'openai-whisper' | 'local-whisper';
		/** URL of the local whisper.cpp server */
		whisperServerUrl: string;
		/** Language for voice recognition */
		language: string;
		/** Selected audio input device ID */
		audioDeviceId?: string;
		/** Auto synthesize: read responses aloud when voice was used as input */
		autoSynthesize?: 'off' | 'on';
		/** Speech timeout in milliseconds (0 to disable) */
		speechTimeout?: number;
	};
	/** OpenAI settings */
	openai: OpenAISettings;
}

export const DEFAULT_SETTINGS: CopilotPluginSettings = {
	aiProvider: "copilot",
	model: "gpt-4.1",
	cliPath: "",
	cliUrl: "",
	streaming: true,
	showInStatusBar: true,
	sessions: [],
	activeSessionId: null,
	skillDirectories: [],
	agentDirectories: [],
	instructionDirectories: [],
	promptDirectories: ["Reference/Prompts"],
	voice: {
		backend: 'openai-whisper',
		whisperServerUrl: 'http://127.0.0.1:8080',
		language: 'auto',
		autoSynthesize: 'off',
		speechTimeout: 0,
	},
	openai: {
		enabled: false,
		apiKey: "",
		model: "gpt-4o",
		baseURL: "",
		organization: "",
		maxTokens: 4096,
		temperature: 0.7,
	},
};

export const AVAILABLE_MODELS = [
	// Auto mode
	{ value: "auto", name: "Auto", rate: "10% discount", section: "auto" },
	// GPT models
	{ value: "gpt-4.1", name: "GPT-4.1", rate: "0x", section: "gpt" },
	{ value: "gpt-4o", name: "GPT-4o", rate: "0x", section: "gpt" },
	{ value: "gpt-5-mini", name: "GPT-5 mini", rate: "0x", section: "gpt" },
	// Claude models
	{ value: "claude-haiku-4.5", name: "Claude Haiku 4.5", rate: "0.33x", section: "claude" },
	{ value: "claude-opus-4.5", name: "Claude Opus 4.5", rate: "3x", section: "claude" },
	{ value: "claude-sonnet-4", name: "Claude Sonnet 4", rate: "1x", section: "claude" },
	{ value: "claude-sonnet-4.5", name: "Claude Sonnet 4.5", rate: "1x", section: "claude" },
	// Gemini models
	{ value: "gemini-2.5-pro", name: "Gemini 2.5 Pro", rate: "1x", section: "gemini" },
	{ value: "gemini-3-flash-preview", name: "Gemini 3 Flash (Preview)", rate: "0.33x", section: "gemini" },
	{ value: "gemini-3-pro-preview", name: "Gemini 3 Pro (Preview)", rate: "1x", section: "gemini" },
	// Other models
	{ value: "goldeneye-internal", name: "Goldeneye (Internal Only)", rate: "1x", section: "other" },
	{ value: "gpt-5", name: "GPT-5", rate: "1x", section: "other" },
	{ value: "gpt-5-codex-preview", name: "GPT-5-Codex (Preview)", rate: "1x", section: "other" },
	{ value: "gpt-5.1", name: "GPT-5.1", rate: "1x", section: "other" },
	{ value: "gpt-5.1-codex", name: "GPT-5.1-Codex", rate: "1x", section: "other" },
	{ value: "gpt-5.1-codex-max", name: "GPT-5.1-Codex-Max", rate: "1x", section: "other" },
	{ value: "gpt-5.1-codex-mini-preview", name: "GPT-5.1-Codex-Mini (Preview)", rate: "0.33x", section: "other" },
	{ value: "gpt-5.2", name: "GPT-5.2", rate: "1x", section: "other" },
	{ value: "gpt-5.2-codex", name: "GPT-5.2-Codex", rate: "1x", section: "other" },
];

export class CopilotSettingTab extends PluginSettingTab {
	plugin: CopilotPlugin;
	private cliManager: CliManager;
	private statusContainer: HTMLElement | null = null;
	private mainSettingsContainer: HTMLElement | null = null;
	private skillsContainer: HTMLElement | null = null;
	private cachedStatus: CliStatus | null = null;
	private skillRegistryUnsubscribe: (() => void) | null = null;
	private toolCatalog: ToolCatalog;

	constructor(app: App, plugin: CopilotPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.cliManager = new CliManager(plugin.settings.cliPath);
		this.toolCatalog = new ToolCatalog(plugin.skillRegistry, plugin.mcpManager);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("vc-settings");

		// CLI Status Section - renders immediately with loading state
		this.renderCliStatusSection(containerEl);

		// Main settings container - will be populated after status check
		this.mainSettingsContainer = containerEl.createDiv({ cls: "vc-main-settings" });

		// Registered Skills Section
		this.renderRegisteredSkillsSection(containerEl);

		// Advanced Settings (always visible)
		this.renderAdvancedSettings(containerEl);

		// Help Section
		this.renderHelpSection(containerEl);

		// Trigger async status check (non-blocking)
		this.checkStatusAsync();
	}

	private renderCliStatusSection(containerEl: HTMLElement): void {
		const section = containerEl.createDiv({ cls: "vc-settings-section" });
		
		const sectionHeader = section.createDiv({ cls: "vc-section-header" });
		sectionHeader.createEl("h3", { text: "Connection Status" });
		
		const refreshBtn = sectionHeader.createEl("button", { 
			cls: "vc-refresh-btn",
			attr: { "aria-label": "Refresh status" }
		});
		refreshBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>`;
		refreshBtn.addEventListener("click", () => {
			refreshBtn.addClass("vc-spinning");
			this.cliManager.invalidateCache();
			this.checkStatusAsync().finally(() => {
				refreshBtn.removeClass("vc-spinning");
			});
		});
		
		this.statusContainer = section.createDiv({ cls: "vc-status-card" });
		
		// Show loading state immediately
		this.renderLoadingStatus();
	}

	private renderLoadingStatus(): void {
		if (!this.statusContainer) return;
		this.statusContainer.empty();
		
		const loadingEl = this.statusContainer.createDiv({ cls: "vc-status-loading" });
		loadingEl.innerHTML = `
			<div class="vc-spinner"></div>
			<span>Checking connection...</span>
		`;
	}

	private async checkStatusAsync(): Promise<void> {
		try {
			const status = await this.cliManager.getStatus(true);
			this.cachedStatus = status;
			this.renderStatusDisplay(status);
			this.renderMainSettingsIfReady(status);
		} catch (error) {
			this.renderStatusError(String(error));
		}
	}

	private renderStatusDisplay(status: CliStatus): void {
		if (!this.statusContainer) return;
		this.statusContainer.empty();

		const statusGrid = this.statusContainer.createDiv({ cls: "vc-status-grid" });

		// CLI Installation Status
		const cliCard = statusGrid.createDiv({ cls: "vc-status-item" });
		this.renderStatusCard(cliCard, {
			label: "CLI Installation",
			isOk: status.installed,
			detail: status.installed ? `v${status.version || "unknown"}` : "Not installed",
			icon: status.installed 
				? `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
				: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
		});

		// Action buttons if CLI not installed
		if (!status.installed) {
			this.renderInstallActions(this.statusContainer);
		} else {
			// Show auth note when CLI is installed
			this.renderAuthNote(this.statusContainer);
		}
	}

	private renderStatusCard(container: HTMLElement, opts: { label: string; isOk: boolean; detail: string; icon: string }): void {
		container.addClass(opts.isOk ? "vc-status-ok" : "vc-status-error");
		
		const iconEl = container.createDiv({ cls: "vc-status-icon" });
		iconEl.innerHTML = opts.icon;
		
		const textEl = container.createDiv({ cls: "vc-status-text" });
		textEl.createEl("span", { text: opts.label, cls: "vc-status-label" });
		textEl.createEl("span", { text: opts.detail, cls: "vc-status-detail" });
	}

	private renderStatusError(error: string): void {
		if (!this.statusContainer) return;
		this.statusContainer.empty();
		
		const errorEl = this.statusContainer.createDiv({ cls: "vc-status-error-msg" });
		errorEl.createEl("span", { text: `Error checking status: ${error}` });
	}

	private renderInstallActions(container: HTMLElement): void {
		const actionsEl = container.createDiv({ cls: "vc-status-actions" });
		
		const installInfo = this.cliManager.getInstallCommand();
		
		// Command display
		const cmdGroup = actionsEl.createDiv({ cls: "vc-cmd-group" });
		cmdGroup.createEl("label", { text: installInfo.description });
		
		const cmdRow = cmdGroup.createDiv({ cls: "vc-cmd-row" });
		cmdRow.createEl("code", { text: installInfo.command });
		
		const copyBtn = cmdRow.createEl("button", { text: "Copy", cls: "vc-btn-secondary vc-btn-sm" });
		copyBtn.addEventListener("click", () => {
			navigator.clipboard.writeText(installInfo.command);
			new Notice("Copied to clipboard");
		});

		// Action buttons
		const btnRow = actionsEl.createDiv({ cls: "vc-btn-row" });
		
		const installBtn = btnRow.createEl("button", { text: "Install Automatically", cls: "vc-btn-primary" });
		installBtn.addEventListener("click", async () => {
			installBtn.disabled = true;
			installBtn.textContent = "Installing...";
			const success = await this.cliManager.installCli();
			if (success) {
				this.cliManager.invalidateCache();
				await this.checkStatusAsync();
			}
			installBtn.disabled = false;
			installBtn.textContent = "Install Automatically";
		});

		const docsLink = btnRow.createEl("a", { text: "View Guide", cls: "vc-btn-link", href: installInfo.url });
		docsLink.setAttr("target", "_blank");
	}

	private renderAuthNote(container: HTMLElement): void {
		const noteEl = container.createDiv({ cls: "vc-auth-note" });
		noteEl.createEl("p", { 
			text: "Authentication is handled automatically when you first use GitHub Copilot. If prompted, use the /login command in the CLI.",
			cls: "vc-status-desc"
		});

		// Expandable PAT info
		const detailsEl = noteEl.createEl("details", { cls: "vc-auth-details" });
		detailsEl.createEl("summary", { text: "Alternative: Use Personal Access Token" });
		
		const patContent = detailsEl.createDiv({ cls: "vc-pat-content" });
		patContent.innerHTML = `
			<ol>
				<li>Visit <a href="https://github.com/settings/personal-access-tokens/new" target="_blank">GitHub PAT Settings</a></li>
				<li>Add the "Copilot Requests" permission</li>
				<li>Generate and copy the token</li>
				<li>Set <code>GH_TOKEN</code> or <code>GITHUB_TOKEN</code> environment variable</li>
			</ol>
		`;
	}

	private renderMainSettingsIfReady(status: CliStatus): void {
		if (!this.mainSettingsContainer) return;
		this.mainSettingsContainer.empty();

		// Vault Initialization Section - only if CLI is installed
		if (status.installed) {
			const initSection = this.mainSettingsContainer.createDiv({ cls: "vc-settings-section" });
			initSection.createEl("h3", { text: "Vault Setup" });
			
			const initDesc = initSection.createEl("p", { 
				text: "Initialize GitHub Copilot for this vault to enable context-aware assistance.",
				cls: "vc-status-desc"
			});
			
			const initBtnRow = initSection.createDiv({ cls: "vc-btn-row" });
			const initBtn = initBtnRow.createEl("button", { text: "Initialize Vault", cls: "vc-btn-primary" });
			initBtn.addEventListener("click", async () => {
				const vaultPath = this.getVaultPath();
				if (!vaultPath) {
					new Notice("Could not determine vault path");
					return;
				}
				initBtn.disabled = true;
				initBtn.textContent = "Initializing...";
				const result = await this.cliManager.initializeVault(vaultPath);
				initBtn.disabled = false;
				initBtn.textContent = "Initialize Vault";
			});
			
			const cmdPreview = initSection.createDiv({ cls: "vc-cmd-group" });
			cmdPreview.createEl("label", { text: "Command that will be run:" });
			const vaultPath = this.getVaultPath() || "<vault_path>";
			const normalizedPath = vaultPath.replace(/\\/g, "/");
			cmdPreview.createEl("code", { text: `copilot --add-dir "${normalizedPath}"`, cls: "vc-code-block" });
		}

		// Chat Preferences Section
		const section = this.mainSettingsContainer.createDiv({ cls: "vc-settings-section" });
		section.createEl("h3", { text: "Chat Preferences" });

		// Model selection
		new Setting(section)
			.setName("Default Model")
			.setDesc("Select the AI model for conversations")
			.addDropdown((dropdown) => {
				for (const model of AVAILABLE_MODELS) {
					dropdown.addOption(model.value, model.name);
				}
				dropdown.setValue(this.plugin.settings.model);
				dropdown.onChange(async (value) => {
					this.plugin.settings.model = value;
					await this.plugin.saveSettings();
				});
			});

		// Status bar toggle
		new Setting(section)
			.setName("Status Bar Indicator")
			.setDesc("Show Copilot connection status in the status bar")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showInStatusBar)
					.onChange(async (value) => {
						this.plugin.settings.showInStatusBar = value;
						await this.plugin.saveSettings();
						this.plugin.updateStatusBar();
					})
			);

		// Tool Selection Defaults Section
		const toolSection = this.mainSettingsContainer.createDiv({ cls: "vc-settings-section" });
		toolSection.createEl("h3", { text: "Tool Selection" });
		
		const toolDesc = toolSection.createEl("p", { 
			text: "Configure which tools are available to the AI by default. Built-in tools are enabled by default, MCP tools are disabled.",
			cls: "vc-status-desc"
		});
		
		// Tool summary display
		const toolSummaryEl = toolSection.createDiv({ cls: "vc-tool-summary" });
		this.updateToolSummary(toolSummaryEl);
		
		// Button to open tool picker
		new Setting(toolSection)
			.setName("Default Enabled Tools")
			.setDesc("Choose which tools are enabled by default for new chat sessions")
			.addButton((button) => {
				button
					.setButtonText("Configure Tools...")
					.onClick(() => {
						const modal = new ToolPickerModal(this.app, {
							toolCatalog: this.toolCatalog,
							settings: this.plugin.settings,
							session: undefined, // no session - defaults mode
							mode: "defaults",
							onSave: async (enabledTools: string[]) => {
								this.plugin.settings.defaultEnabledTools = enabledTools;
								this.plugin.settings.defaultDisabledTools = [];
								await this.plugin.saveSettings();
								this.updateToolSummary(toolSummaryEl);
								new Notice("Default tool selection saved");
							}
						});
						modal.open();
					});
			});

		// Voice Chat Settings Section
		this.renderVoiceSettings(this.mainSettingsContainer);
	}

	private renderVoiceSettings(container: HTMLElement): void {
		const voiceSection = container.createDiv({ cls: "vc-settings-section" });
		voiceSection.createEl("h3", { text: "Voice Input" });
		
		voiceSection.createEl("p", { 
			text: "Configure voice-to-text for hands-free chat input.",
			cls: "vc-status-desc"
		});

		// Ensure voice settings exist
		if (!this.plugin.settings.voice) {
			this.plugin.settings.voice = {
				backend: 'openai-whisper',
				whisperServerUrl: 'http://127.0.0.1:8080',
				language: 'auto',
				audioDeviceId: undefined,
				autoSynthesize: 'off',
				speechTimeout: 0,
			};
		}

		// 1. Audio device selection (Microphone) - FIRST
		const audioDeviceSetting = new Setting(voiceSection)
			.setName("Microphone")
			.setDesc("Select the audio input device");
		
		this.populateAudioDevices(audioDeviceSetting);

		// 2. Voice language (common to all backends) - SECOND
		new Setting(voiceSection)
			.setName("Speech Language")
			.setDesc("The language that text-to-speech and speech-to-text should use. Select 'auto' to use the configured display language if possible. Note that not all display languages may be supported by speech recognition and synthesizers.")
			.addDropdown((dropdown) => {
				const languages = [
					{ value: 'auto', name: 'Auto (Use Display Language)' },
					{ value: 'en-US', name: 'English (US)' },
					{ value: 'en-GB', name: 'English (UK)' },
					{ value: 'es-ES', name: 'Spanish' },
					{ value: 'fr-FR', name: 'French' },
					{ value: 'de-DE', name: 'German' },
					{ value: 'it-IT', name: 'Italian' },
					{ value: 'pt-BR', name: 'Portuguese (Brazil)' },
					{ value: 'ja-JP', name: 'Japanese' },
					{ value: 'zh-CN', name: 'Chinese (Simplified)' },
					{ value: 'ko-KR', name: 'Korean' },
				];
				for (const lang of languages) {
					dropdown.addOption(lang.value, lang.name);
				}
				dropdown.setValue(this.plugin.settings.voice!.language);
				dropdown.onChange(async (value) => {
					this.plugin.settings.voice!.language = value;
					await this.plugin.saveSettings();
				});
			});

		// 3. Auto Synthesize - read responses aloud
		new Setting(voiceSection)
			.setName("Auto Synthesize")
			.setDesc("Whether a textual response should automatically be read out aloud when speech was used as input. For example in a chat session, a response is automatically synthesized when voice was used as chat request.")
			.addDropdown((dropdown) => {
				dropdown.addOption('off', 'off');
				dropdown.addOption('on', 'on');
				dropdown.setValue(this.plugin.settings.voice!.autoSynthesize || 'off');
				dropdown.onChange(async (value) => {
					this.plugin.settings.voice!.autoSynthesize = value as 'off' | 'on';
					await this.plugin.saveSettings();
				});
			});

		// 4. Speech Timeout
		new Setting(voiceSection)
			.setName("Speech Timeout")
			.setDesc("The duration in milliseconds that voice speech recognition remains active after you stop speaking. For example in a chat session, the transcribed text is submitted automatically after the timeout is met. Set to 0 to disable this feature.")
			.addText((text) => {
				text.setPlaceholder('0');
				text.setValue(String(this.plugin.settings.voice!.speechTimeout || 0));
				text.inputEl.type = 'number';
				text.inputEl.min = '0';
				text.onChange(async (value) => {
					const timeout = parseInt(value, 10) || 0;
					this.plugin.settings.voice!.speechTimeout = timeout;
					await this.plugin.saveSettings();
				});
			});

		// Container for conditional settings (created before backend dropdown so we can reference it)
		const conditionalContainer = voiceSection.createDiv({ cls: "vc-voice-conditional" });

		// 5. Voice backend selection
		new Setting(voiceSection)
			.setName("Voice Backend")
			.setDesc("Choose the speech-to-text service")
			.addDropdown((dropdown) => {
				dropdown.addOption('openai-whisper', 'OpenAI Whisper API (recommended)');
				dropdown.addOption('local-whisper', 'Local Whisper Server');
				dropdown.setValue(this.plugin.settings.voice!.backend);
				dropdown.onChange(async (value) => {
					this.plugin.settings.voice!.backend = value as 'openai-whisper' | 'local-whisper';
					await this.plugin.saveSettings();
					// Re-render conditional settings
					this.renderVoiceConditionalSettings(conditionalContainer);
				});
			});

		// Move conditional container to appear after the backend dropdown
		voiceSection.appendChild(conditionalContainer);

		// Render conditional settings based on backend
		this.renderVoiceConditionalSettings(conditionalContainer);
	}

	private async populateAudioDevices(setting: Setting): Promise<void> {
		setting.addDropdown(async (dropdown) => {
			dropdown.addOption('default', 'System Default');
			
			try {
				// Request microphone permission first (required to enumerate devices)
				await navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
					stream.getTracks().forEach(track => track.stop());
				});
				
				const devices = await navigator.mediaDevices.enumerateDevices();
				const audioInputs = devices.filter(d => d.kind === 'audioinput');
				
				for (const device of audioInputs) {
					const label = device.label || `Microphone ${audioInputs.indexOf(device) + 1}`;
					dropdown.addOption(device.deviceId, label);
				}
			} catch (error) {
				console.log('Could not enumerate audio devices:', error);
			}
			
			dropdown.setValue(this.plugin.settings.voice?.audioDeviceId || 'default');
			dropdown.onChange(async (value) => {
				if (this.plugin.settings.voice) {
					this.plugin.settings.voice.audioDeviceId = value === 'default' ? undefined : value;
					await this.plugin.saveSettings();
				}
			});
		});
	}

	private renderVoiceConditionalSettings(container: HTMLElement): void {
		container.empty();
		const backend = this.plugin.settings.voice?.backend || 'openai-whisper';

		if (backend === 'openai-whisper') {
			// OpenAI Whisper settings
			const openaiSection = container.createDiv({ cls: "vc-voice-openai-settings" });
			openaiSection.createEl("h4", { text: "OpenAI Whisper Settings" });
			
			// API Key status indicator
			const apiKeyFromEnv = getOpenAIApiKey();
			const hasEnvKey = !!apiKeyFromEnv && !this.plugin.settings.openai.apiKey;
			
			if (hasEnvKey) {
				const envNotice = openaiSection.createDiv({ cls: "vc-openai-env-notice" });
				envNotice.innerHTML = `
					<span class="vc-status-ok">✓</span>
					<span>Using API key from <code>OPENAI_API_KEY</code> environment variable</span>
				`;
			}

			// API Key input
			new Setting(openaiSection)
				.setName("API Key")
				.setDesc(hasEnvKey 
					? "Override the environment variable with a custom key (optional)" 
					: "Enter your OpenAI API key, or set OPENAI_API_KEY environment variable")
				.addText((text) => {
					text.setPlaceholder(hasEnvKey ? "(using env variable)" : "sk-...");
					text.setValue(this.plugin.settings.openai.apiKey);
					text.inputEl.type = "password";
					text.onChange(async (value) => {
						this.plugin.settings.openai.apiKey = value;
						await this.plugin.saveSettings();
					});
				})
				.addButton((button) => {
					button.setButtonText("Test");
					button.onClick(async () => {
						button.setDisabled(true);
						button.setButtonText("...");
						try {
							const service = new OpenAIService(this.app, {
								provider: "openai",
								model: this.plugin.settings.openai.model,
								streaming: this.plugin.settings.streaming,
								apiKey: this.plugin.settings.openai.apiKey || undefined,
								baseURL: this.plugin.settings.openai.baseURL || undefined,
							});
							const result = await service.testConnection();
							if (result.success) {
								new Notice("✓ OpenAI connection successful!");
							} else {
								new Notice(`✗ Connection failed: ${result.error}`);
							}
							await service.destroy();
						} catch (error) {
							new Notice(`✗ Error: ${error instanceof Error ? error.message : String(error)}`);
						}
						button.setButtonText("Test");
						button.setDisabled(false);
					});
				});

			// Base URL (optional)
			new Setting(openaiSection)
				.setName("Base URL")
				.setDesc("Custom API endpoint (optional, for Azure or compatible APIs)")
				.addText((text) => {
					text.setPlaceholder("https://api.openai.com/v1");
					text.setValue(this.plugin.settings.openai.baseURL);
					text.onChange(async (value) => {
						this.plugin.settings.openai.baseURL = value;
						await this.plugin.saveSettings();
					});
				});

			// Help text
			const helpEl = openaiSection.createDiv({ cls: "vc-openai-help" });
			helpEl.innerHTML = `
				<details>
					<summary>Getting an OpenAI API Key</summary>
					<ol>
						<li>Visit <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI API Keys</a></li>
						<li>Create a new secret key</li>
						<li>Copy and paste here, or set <code>OPENAI_API_KEY</code> environment variable</li>
					</ol>
				</details>
			`;

		} else if (backend === 'local-whisper') {
			// Local Whisper settings
			const localSection = container.createDiv({ cls: "vc-voice-local-settings" });
			localSection.createEl("h4", { text: "Local Whisper Server Settings" });

			// Whisper server URL
			new Setting(localSection)
				.setName("Server URL")
				.setDesc("URL of your local whisper.cpp server")
				.addText((text) => {
					text.setPlaceholder('http://127.0.0.1:8080');
					text.setValue(this.plugin.settings.voice!.whisperServerUrl);
					text.onChange(async (value) => {
						this.plugin.settings.voice!.whisperServerUrl = value || 'http://127.0.0.1:8080';
						await this.plugin.saveSettings();
					});
				})
				.addButton((button) => {
					button.setButtonText("Test");
					button.onClick(async () => {
						button.setDisabled(true);
						button.setButtonText("...");
						try {
							const url = this.plugin.settings.voice?.whisperServerUrl || 'http://127.0.0.1:8080';
							const response = await fetch(url, { method: 'GET' });
							if (response.ok || response.status === 404) {
								new Notice("✓ Whisper server is reachable!");
							} else {
								new Notice(`✗ Server returned status ${response.status}`);
							}
						} catch (error) {
							new Notice(`✗ Could not connect to server: ${error instanceof Error ? error.message : String(error)}`);
						}
						button.setButtonText("Test");
						button.setDisabled(false);
					});
				});

			// Setup instructions
			const setupDetails = localSection.createEl("details", { cls: "vc-voice-setup" });
			setupDetails.createEl("summary", { text: "How to set up local whisper server" });
			
			const setupContent = setupDetails.createDiv({ cls: "vc-voice-setup-content" });
			setupContent.innerHTML = `
				<p>Uses <a href="https://github.com/ggerganov/whisper.cpp" target="_blank">whisper.cpp</a> for offline speech recognition.</p>
				<h5>Quick Start:</h5>
				<ol>
					<li>Download whisper.cpp from <a href="https://github.com/ggerganov/whisper.cpp/releases" target="_blank">releases</a></li>
					<li>Download a model (e.g., <code>ggml-base.en.bin</code>) from <a href="https://huggingface.co/ggerganov/whisper.cpp/tree/main" target="_blank">Hugging Face</a></li>
					<li>Run: <code>whisper-server -m ggml-base.en.bin --convert</code></li>
				</ol>
				<h5>Alternative: Docker</h5>
				<pre><code>docker run -p 8080:8080 ghcr.io/ggerganov/whisper.cpp:main-cuda \\
  -m models/ggml-base.en.bin --convert</code></pre>
			`;
		}
	}

	private updateToolSummary(container: HTMLElement): void {
		container.empty();
		const summary = this.toolCatalog.getToolsSummary(this.plugin.settings);
		container.createEl("span", { 
			text: `${summary.enabled}/${summary.total} tools enabled (${summary.builtin} built-in, ${summary.plugin} plugin, ${summary.mcp} MCP)`,
			cls: "vc-status-detail"
		});
	}

	private renderRegisteredSkillsSection(containerEl: HTMLElement): void {
		const section = containerEl.createDiv({ cls: "vc-settings-section vc-skills-section" });
		
		const sectionHeader = section.createDiv({ cls: "vc-section-header" });
		sectionHeader.createEl("h3", { text: "Registered Skills & MCP Servers" });
		
		this.skillsContainer = section.createDiv({ cls: "vc-skills-container" });
		
		// Subscribe to skill registry changes
		if (this.skillRegistryUnsubscribe) {
			this.skillRegistryUnsubscribe();
		}
		this.skillRegistryUnsubscribe = this.plugin.skillRegistry.onSkillChange(() => {
			this.updateSkillsDisplay();
		});
		
		// Initial render
		this.updateSkillsDisplay();
	}

	private updateSkillsDisplay(): void {
		if (!this.skillsContainer) return;
		this.skillsContainer.empty();
		
		const skills = this.plugin.skillRegistry.listSkills();
		
		// Skills Table
		this.renderSkillsTable(this.skillsContainer, skills);
		
		// MCP Servers Table - now using McpManager
		this.renderMcpServersSection(this.skillsContainer);
	}

	private renderSkillsTable(container: HTMLElement, skills: SkillInfo[]): void {
		const skillsSection = container.createDiv({ cls: "vc-skills-subsection" });
		skillsSection.createEl("h4", { text: "Skills" });
		
		if (skills.length === 0) {
			const emptyState = skillsSection.createDiv({ cls: "vc-empty-state" });
			emptyState.createEl("p", { text: "No skills registered yet." });
			emptyState.createEl("p", { 
				text: "Skills can be registered by other plugins using the Vault Copilot API.",
				cls: "vc-status-desc"
			});
			return;
		}
		
		const table = skillsSection.createEl("table", { cls: "vc-skills-table" });
		
		// Header row
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		headerRow.createEl("th", { text: "Name" });
		headerRow.createEl("th", { text: "Description" });
		headerRow.createEl("th", { text: "Plugin" });
		headerRow.createEl("th", { text: "Category" });
		
		// Body rows
		const tbody = table.createEl("tbody");
		for (const skill of skills) {
			const row = tbody.createEl("tr");
			row.createEl("td", { text: skill.name, cls: "vc-skill-name" });
			row.createEl("td", { text: skill.description, cls: "vc-skill-desc" });
			row.createEl("td", { text: skill.pluginId, cls: "vc-skill-plugin" });
			row.createEl("td", { text: skill.category || "general", cls: "vc-skill-category" });
		}
		
		// Summary
		const summary = skillsSection.createDiv({ cls: "vc-table-summary" });
		const pluginCount = new Set(skills.map(s => s.pluginId)).size;
		summary.createEl("span", { 
			text: `${skills.length} skill${skills.length !== 1 ? "s" : ""} from ${pluginCount} plugin${pluginCount !== 1 ? "s" : ""}` 
		});
	}

	private renderMcpServersSection(container: HTMLElement): void {
		const mcpSection = container.createDiv({ cls: "vc-skills-subsection" });
		
		// Header with refresh button
		const headerRow = mcpSection.createDiv({ cls: "vc-mcp-header-row" });
		headerRow.createEl("h4", { text: "MCP Servers" });
		
		const refreshBtn = headerRow.createEl("button", { 
			text: "↻ Refresh",
			cls: "vc-mcp-refresh-btn"
		});
		refreshBtn.addEventListener("click", async () => {
			await this.plugin.mcpManager.refreshDiscovery();
			this.updateSkillsDisplay();
			new Notice("MCP servers refreshed");
		});
		
		const servers = this.plugin.mcpManager.getServers();
		
		if (servers.length === 0) {
			const emptyState = mcpSection.createDiv({ cls: "vc-empty-state" });
			emptyState.createEl("p", { text: "No MCP servers discovered." });
			emptyState.createEl("p", { 
				text: "MCP servers are auto-discovered from Claude Desktop, VS Code, Cursor, and Copilot CLI configs.",
				cls: "vc-status-desc"
			});
			return;
		}
		
		// Group servers by source
		const bySource = new Map<string, DiscoveredMcpServer[]>();
		for (const server of servers) {
			const source = server.config.source;
			if (!bySource.has(source)) {
				bySource.set(source, []);
			}
			bySource.get(source)!.push(server);
		}
		
		// Render each source group
		for (const [source, sourceServers] of bySource) {
			const sourceSection = mcpSection.createDiv({ cls: "vc-mcp-source-section" });
			sourceSection.createEl("h5", { 
				text: `${getSourceIcon(source as McpServerSource)} ${getSourceLabel(source as McpServerSource)}`,
				cls: "vc-mcp-source-header"
			});
			
			const table = sourceSection.createEl("table", { cls: "vc-skills-table vc-mcp-table" });
			
			// Header row
			const thead = table.createEl("thead");
			const headerRow2 = thead.createEl("tr");
			headerRow2.createEl("th", { text: "Name" });
			headerRow2.createEl("th", { text: "Type" });
			headerRow2.createEl("th", { text: "Status" });
			headerRow2.createEl("th", { text: "Actions" });
			
			// Body rows
			const tbody = table.createEl("tbody");
			for (const server of sourceServers) {
				this.renderMcpServerRow(tbody, server);
			}
		}
		
		// Summary
		const summary = mcpSection.createDiv({ cls: "vc-table-summary" });
		const connectedCount = servers.filter(s => s.status.status === "connected").length;
		summary.createEl("span", { 
			text: `${connectedCount} of ${servers.length} server${servers.length !== 1 ? "s" : ""} connected` 
		});
	}
	
	private renderMcpServerRow(tbody: HTMLElement, server: DiscoveredMcpServer): void {
		const row = tbody.createEl("tr");
		const config = server.config;
		const status = server.status;
		
		// Name cell
		const nameCell = row.createEl("td", { cls: "vc-mcp-name" });
		nameCell.createEl("strong", { text: config.name });
		if (isStdioConfig(config)) {
			nameCell.createEl("div", { 
				text: `${config.command} ${(config.args || []).join(" ")}`,
				cls: "vc-mcp-command"
			});
		}
		
		// Type cell
		row.createEl("td", { 
			text: config.transport === "stdio" ? "stdio" : "HTTP",
			cls: "vc-mcp-type" 
		});
		
		// Status cell
		const statusCell = row.createEl("td", { cls: "vc-mcp-status" });
		const statusBadge = this.getStatusBadge(status.status);
		const badge = statusCell.createEl("span", { 
			text: statusBadge.text,
			cls: `vc-status-badge ${statusBadge.cls}`
		});
		if (status.error) {
			badge.setAttribute("title", status.error);
		}
		if (status.tools && status.tools.length > 0) {
			statusCell.createEl("div", { 
				text: `${status.tools.length} tools`,
				cls: "vc-mcp-tools-count"
			});
		}
		
		// Actions cell
		const actionsCell = row.createEl("td", { cls: "vc-mcp-actions" });
		
		if (status.status === "connected") {
			const stopBtn = actionsCell.createEl("button", { 
				text: "Stop",
				cls: "vc-mcp-action-btn vc-mcp-stop-btn"
			});
			stopBtn.addEventListener("click", async () => {
				try {
					await this.plugin.mcpManager.stopServer(config.id);
					this.updateSkillsDisplay();
					new Notice(`Stopped ${config.name}`);
				} catch (error) {
					new Notice(`Failed to stop: ${error}`);
				}
			});
		} else if (status.status === "connecting") {
			actionsCell.createEl("span", { text: "Connecting...", cls: "vc-mcp-connecting" });
		} else {
			// Disconnected or error - show Start button
			const startBtn = actionsCell.createEl("button", { 
				text: "Start",
				cls: "vc-mcp-action-btn vc-mcp-start-btn"
			});
			startBtn.addEventListener("click", async () => {
				try {
					startBtn.disabled = true;
					startBtn.textContent = "Starting...";
					await this.plugin.mcpManager.startServer(config.id);
					this.updateSkillsDisplay();
					new Notice(`Started ${config.name}`);
				} catch (error) {
					new Notice(`Failed to start: ${error}`);
					this.updateSkillsDisplay();
				}
			});
		}
	}
	
	private getStatusBadge(status: McpConnectionStatus): { text: string; cls: string } {
		switch (status) {
			case "connected":
				return { text: "Connected", cls: "vc-badge-ok" };
			case "connecting":
				return { text: "Connecting", cls: "vc-badge-warning" };
			case "error":
				return { text: "Error", cls: "vc-badge-error" };
			case "disconnected":
			default:
				return { text: "Stopped", cls: "vc-badge-disabled" };
		}
	}

	// Keep old method for backward compatibility with SkillRegistry-based MCP servers
	private renderMcpServersTable(container: HTMLElement, servers: Map<string, McpServerConfig>): void {
		// This method is now deprecated in favor of renderMcpServersSection
		// Keeping for potential backward compatibility
	}

	private renderAdvancedSettings(containerEl: HTMLElement): void {
		const section = containerEl.createDiv({ cls: "vc-settings-section vc-settings-advanced" });
		
		const header = section.createEl("details");
		header.createEl("summary", { text: "Advanced Settings" });
		
		const content = header.createDiv({ cls: "vc-advanced-content" });

		// Skill Directories Section
		this.renderDirectoryList(
			content,
			"Skill Directories",
			"Folders containing skill definition files. Paths can be relative to the vault or absolute.",
			this.plugin.settings.skillDirectories,
			async (dirs) => {
				this.plugin.settings.skillDirectories = dirs;
				await this.plugin.saveSettings();
			}
		);

		// Agent Directories Section
		this.renderDirectoryList(
			content,
			"Agent Directories",
			"Folders containing custom agent definition files. Paths can be relative to the vault or absolute.",
			this.plugin.settings.agentDirectories,
			async (dirs) => {
				this.plugin.settings.agentDirectories = dirs;
				await this.plugin.saveSettings();
			}
		);

		// Instruction Directories Section
		this.renderDirectoryList(
			content,
			"Instruction Directories",
			"Folders containing .instructions.md files that provide context to the assistant.",
			this.plugin.settings.instructionDirectories,
			async (dirs) => {
				this.plugin.settings.instructionDirectories = dirs;
				await this.plugin.saveSettings();
			}
		);

		// Prompt Directories Section
		this.renderDirectoryList(
			content,
			"Prompt Directories",
			"Folders containing .prompt.md files that define reusable prompts. Access prompts by typing / in chat.",
			this.plugin.settings.promptDirectories,
			async (dirs) => {
				this.plugin.settings.promptDirectories = dirs;
				await this.plugin.saveSettings();
			}
		);
	}

	private renderDirectoryList(
		container: HTMLElement,
		title: string,
		description: string,
		directories: string[],
		onUpdate: (dirs: string[]) => Promise<void>
	): void {
		const wrapper = container.createDiv({ cls: "vc-directory-list" });
		
		const headerRow = wrapper.createDiv({ cls: "vc-directory-header" });
		headerRow.createEl("label", { text: title, cls: "vc-directory-title" });
		headerRow.createEl("span", { text: description, cls: "vc-directory-desc" });
		
		const listContainer = wrapper.createDiv({ cls: "vc-directory-items" });
		
		const renderItems = () => {
			listContainer.empty();
			
			if (directories.length === 0) {
				listContainer.createEl("span", { 
					text: "No directories configured",
					cls: "vc-directory-empty"
				});
			} else {
				for (let i = 0; i < directories.length; i++) {
					const dir = directories[i];
					const itemEl = listContainer.createDiv({ cls: "vc-directory-item" });
					
					const pathEl = itemEl.createEl("code", { text: dir, cls: "vc-directory-path" });
					
					const removeBtn = itemEl.createEl("button", { 
						cls: "vc-btn-icon vc-btn-remove",
						attr: { "aria-label": "Remove directory" }
					});
					removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
					removeBtn.addEventListener("click", async () => {
						directories.splice(i, 1);
						await onUpdate(directories);
						renderItems();
					});
				}
			}
		};
		
		renderItems();
		
		// Add new directory input
		const addRow = wrapper.createDiv({ cls: "vc-directory-add" });
		const input = addRow.createEl("input", {
			type: "text",
			placeholder: ".copilot/skills or /absolute/path",
			cls: "vc-directory-input"
		});
		
		const addBtn = addRow.createEl("button", { text: "Add", cls: "vc-btn-secondary vc-btn-sm" });
		addBtn.addEventListener("click", async () => {
			const value = input.value.trim();
			if (value && !directories.includes(value)) {
				directories.push(value);
				await onUpdate(directories);
				input.value = "";
				renderItems();
			}
		});
		
		// Allow Enter key to add
		input.addEventListener("keydown", async (e) => {
			if (e.key === "Enter") {
				const value = input.value.trim();
				if (value && !directories.includes(value)) {
					directories.push(value);
					await onUpdate(directories);
					input.value = "";
					renderItems();
				}
			}
		});
	}

	private renderHelpSection(containerEl: HTMLElement): void {
		const section = containerEl.createDiv({ cls: "vc-settings-section vc-settings-help" });
		
		const helpContent = section.createDiv({ cls: "vc-help-content" });
		
		helpContent.createEl("h4", { text: "About Vault Copilot" });
		helpContent.createEl("p", {
			text: "Vault Copilot brings AI assistance into Obsidian by connecting to your GitHub Copilot account. It uses the GitHub Copilot CLI SDK along with Agent Skills, MCP tools, and plugin-defined skills to enable powerful operations inside your vault. The assistant can read and search notes, create and update content, help organize information, and support workflows that span multiple plugins."
		});
		helpContent.createEl("p", {
			text: "Vault Copilot is designed to be extensible. You can add your own skills, enable MCP integrations, or install plugins that register additional capabilities. The assistant automatically discovers these tools and uses them when they are relevant."
		});
		helpContent.createEl("p", {
			text: "Vault Copilot is a community project. It is not affiliated with, sponsored by, or endorsed by Microsoft or GitHub."
		});

		const reqDiv = helpContent.createDiv({ cls: "vc-requirements" });
		reqDiv.createEl("h4", { text: "Requirements" });
		const reqList = reqDiv.createEl("ul");
		reqList.createEl("li", { text: "GitHub Copilot CLI installed" });
		reqList.createEl("li", { text: "Active GitHub Copilot subscription" });
		reqList.createEl("li", { text: "Authentication completed through the Copilot CLI" });
		reqList.createEl("li", { text: "Obsidian vault with read and write access" });

		const linksDiv = helpContent.createDiv({ cls: "vc-help-links" });
		
		const links = [
			{ text: "GitHub Copilot Documentation", url: "https://docs.github.com/en/copilot" },
			{ text: "GitHub Copilot CLI Installation Guide", url: "https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli" },
			{ text: "GitHub Copilot Plans & Pricing", url: "https://github.com/features/copilot/plans" },
		];
		
		for (const link of links) {
			const a = linksDiv.createEl("a", { text: link.text, href: link.url });
			a.setAttr("target", "_blank");
		}
	}

	private getVaultPath(): string | undefined {
		const adapter = this.app.vault.adapter;
		if (adapter instanceof FileSystemAdapter) {
			return adapter.getBasePath();
		}
		return undefined;
	}

	hide(): void {
		// Clean up skill registry subscription
		if (this.skillRegistryUnsubscribe) {
			this.skillRegistryUnsubscribe();
			this.skillRegistryUnsubscribe = null;
		}
		
		// Refresh agent cache when settings panel closes (in case directories changed)
		this.plugin.agentCache?.refreshCache();
		
		// Refresh prompt cache when settings panel closes (in case directories changed)
		this.plugin.promptCache?.refreshCache();
	}
}

