import { App, PluginSettingTab, Setting, Notice, FileSystemAdapter } from "obsidian";
import CopilotPlugin from "./main";
import { CliManager, CliStatus } from "./copilot/CliManager";
import { SkillInfo, SkillRegistryEvent, McpServerConfig } from "./copilot/SkillRegistry";
import { ChatMessage } from "./copilot/CopilotService";

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
}

export interface CopilotPluginSettings {
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
}

export const DEFAULT_SETTINGS: CopilotPluginSettings = {
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

	constructor(app: App, plugin: CopilotPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.cliManager = new CliManager(plugin.settings.cliPath);
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

		if (!status.installed) {
			return; // Don't show main settings if CLI not installed
		}

		// Vault Initialization Section
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
		const mcpServers = this.plugin.skillRegistry.getMcpServers();
		
		// Skills Table
		this.renderSkillsTable(this.skillsContainer, skills);
		
		// MCP Servers Table
		this.renderMcpServersTable(this.skillsContainer, mcpServers);
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

	private renderMcpServersTable(container: HTMLElement, servers: Map<string, McpServerConfig>): void {
		const mcpSection = container.createDiv({ cls: "vc-skills-subsection" });
		mcpSection.createEl("h4", { text: "MCP Servers" });
		
		if (servers.size === 0) {
			const emptyState = mcpSection.createDiv({ cls: "vc-empty-state" });
			emptyState.createEl("p", { text: "No MCP servers configured." });
			emptyState.createEl("p", { 
				text: "MCP (Model Context Protocol) servers provide additional tools and data sources for the assistant.",
				cls: "vc-status-desc"
			});
			return;
		}
		
		const table = mcpSection.createEl("table", { cls: "vc-skills-table" });
		
		// Header row
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		headerRow.createEl("th", { text: "ID" });
		headerRow.createEl("th", { text: "Name" });
		headerRow.createEl("th", { text: "URL" });
		headerRow.createEl("th", { text: "Status" });
		
		// Body rows
		const tbody = table.createEl("tbody");
		for (const [id, server] of servers) {
			const row = tbody.createEl("tr");
			row.createEl("td", { text: id, cls: "vc-mcp-name" });
			row.createEl("td", { text: server.name || id, cls: "vc-mcp-type" });
			row.createEl("td", { text: server.url, cls: "vc-skill-desc" });
			const statusCell = row.createEl("td", { cls: "vc-mcp-status" });
			statusCell.createEl("span", { 
				text: server.enabled !== false ? "Enabled" : "Disabled",
				cls: `vc-status-badge ${server.enabled !== false ? "vc-badge-ok" : "vc-badge-disabled"}`
			});
		}
		
		// Summary
		const summary = mcpSection.createDiv({ cls: "vc-table-summary" });
		const enabledCount = Array.from(servers.values()).filter(s => s.enabled !== false).length;
		summary.createEl("span", { 
			text: `${enabledCount} of ${servers.size} server${servers.size !== 1 ? "s" : ""} enabled` 
		});
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

