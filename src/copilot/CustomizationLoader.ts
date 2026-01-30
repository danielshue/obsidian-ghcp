/**
 * CustomizationLoader - Loads and parses custom agents, skills, and instructions
 * from configured directories in the vault.
 * 
 * File formats:
 * - Agents: *.agent.md with frontmatter (name, description, tools)
 * - Skills: <skill-name>/SKILL.md - each skill is a folder containing a SKILL.md file
 *           The SKILL.md can use either:
 *           1. Standard frontmatter at the top
 *           2. A ```skill code block with frontmatter inside
 * - Instructions: *.instructions.md or copilot-instructions.md with optional frontmatter (applyTo)
 */

import { App, TFile, TFolder } from "obsidian";

/**
 * Parsed agent from .agent.md file
 */
export interface CustomAgent {
	/** Unique identifier from frontmatter name field */
	name: string;
	/** Human-readable description */
	description: string;
	/** Tools the agent can use */
	tools?: string[];
	/** Full path to the agent file */
	path: string;
	/** Raw content of the agent file (without frontmatter) */
	instructions: string;
}

/**
 * Parsed skill from SKILL.md file
 */
export interface CustomSkill {
	/** Unique identifier from frontmatter name field */
	name: string;
	/** Description of when to use the skill */
	description: string;
	/** Optional license */
	license?: string;
	/** Full path to the skill directory */
	path: string;
	/** Raw content of the skill file (without frontmatter) */
	instructions: string;
}

/**
 * Parsed instruction from .instructions.md file
 */
export interface CustomInstruction {
	/** File name without extension */
	name: string;
	/** Optional path pattern for when to apply */
	applyTo?: string;
	/** Full path to the instruction file */
	path: string;
	/** Raw content of the instruction file (without frontmatter) */
	content: string;
}

/**
 * Simple YAML key-value parser
 */
function parseYamlKeyValues(yamlStr: string): Record<string, unknown> {
	const frontmatter: Record<string, unknown> = {};
	const lines = yamlStr.split(/\r?\n/);
	
	for (const line of lines) {
		const colonIndex = line.indexOf(':');
		if (colonIndex === -1) continue;

		const key = line.slice(0, colonIndex).trim();
		let value: unknown = line.slice(colonIndex + 1).trim();

		// Handle arrays like ["read", "search", "edit"]
		if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
			try {
				value = JSON.parse(value.replace(/'/g, '"'));
			} catch {
				// Keep as string if parsing fails
			}
		}
		// Handle quoted strings
		else if (typeof value === 'string' && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
			value = value.slice(1, -1);
		}

		frontmatter[key] = value;
	}
	
	return frontmatter;
}

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) {
		return { frontmatter: {}, body: content };
	}

	const yamlStr = match[1] || '';
	const body = match[2] || '';

	return { frontmatter: parseYamlKeyValues(yamlStr), body: body.trim() };
}

/**
 * Parse content from a code block (e.g., ```skill ... ```)
 * The code block may contain frontmatter inside it.
 */
function parseCodeBlockContent(content: string, blockType: string): { frontmatter: Record<string, unknown>; body: string } | null {
	// Match code block with specific type: ```skill\n...\n```
	const codeBlockRegex = new RegExp('^```' + blockType + '\\r?\\n([\\s\\S]*?)\\r?\\n```\\s*$');
	const match = content.trim().match(codeBlockRegex);
	
	if (!match) {
		return null;
	}
	
	const blockContent = match[1] || '';
	
	// Now parse frontmatter from within the code block
	return parseFrontmatter(blockContent);
}

/**
 * Loader class for custom agents, skills, and instructions
 */
export class CustomizationLoader {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Load all agents from the configured agent directories
	 */
	async loadAgents(directories: string[]): Promise<CustomAgent[]> {
		const agents: CustomAgent[] = [];

		for (const dir of directories) {
			const folder = this.app.vault.getAbstractFileByPath(dir);
			if (!folder || !(folder instanceof TFolder)) {
				console.log(`[VC] Agent directory not found or not a folder: "${dir}"`);
				continue;
			}

			console.log(`[VC] Scanning agent directory: "${dir}" with ${folder.children.length} children`);

			// Find all .agent.md files in this directory
			for (const child of folder.children) {
				if (child instanceof TFile && child.extension === 'md' && child.name.endsWith('.agent.md')) {
					try {
						const content = await this.app.vault.read(child);
						const { frontmatter, body } = parseFrontmatter(content);

						if (frontmatter.name && frontmatter.description) {
							agents.push({
								name: String(frontmatter.name),
								description: String(frontmatter.description),
								tools: Array.isArray(frontmatter.tools) ? frontmatter.tools : undefined,
								path: child.path,
								instructions: body,
							});
						}
					} catch (error) {
						console.error(`Failed to load agent from ${child.path}:`, error);
					}
				}
			}
		}

		return agents;
	}

	/**
	 * Load all skills from the configured skill directories
	 */
	async loadSkills(directories: string[]): Promise<CustomSkill[]> {
		const skills: CustomSkill[] = [];

		for (const dir of directories) {
			const folder = this.app.vault.getAbstractFileByPath(dir);
			if (!folder || !(folder instanceof TFolder)) {
				continue;
			}

			// Skills are in subdirectories with SKILL.md files
			for (const child of folder.children) {
				if (child instanceof TFolder) {
					// Look for SKILL.md in this subdirectory
					const skillFile = this.app.vault.getAbstractFileByPath(`${child.path}/SKILL.md`);
					if (skillFile && skillFile instanceof TFile) {
						try {
							const content = await this.app.vault.read(skillFile);
							
							// Try parsing as code block first (```skill ... ```)
							let parsed = parseCodeBlockContent(content, 'skill');
							
							// Fall back to regular frontmatter if not a code block
							if (!parsed) {
								parsed = parseFrontmatter(content);
							}
							
							const { frontmatter, body } = parsed;

							if (frontmatter.name && frontmatter.description) {
								skills.push({
									name: String(frontmatter.name),
									description: String(frontmatter.description),
									license: frontmatter.license ? String(frontmatter.license) : undefined,
									path: child.path,
									instructions: body,
								});
							}
						} catch (error) {
							console.error(`Failed to load skill from ${skillFile.path}:`, error);
						}
					}
				}
			}
		}

		return skills;
	}

	/**
	 * Load all instructions from the configured instruction directories
	 */
	async loadInstructions(directories: string[]): Promise<CustomInstruction[]> {
		const instructions: CustomInstruction[] = [];

		for (const dir of directories) {
			const folder = this.app.vault.getAbstractFileByPath(dir);
			if (!folder || !(folder instanceof TFolder)) {
				continue;
			}

			// Find all .instructions.md files or copilot-instructions.md
			for (const child of folder.children) {
				if (child instanceof TFile && child.extension === 'md') {
					const isInstructionFile = child.name.endsWith('.instructions.md') || 
						child.name === 'copilot-instructions.md';
					
					if (isInstructionFile) {
						try {
							const content = await this.app.vault.read(child);
							const { frontmatter, body } = parseFrontmatter(content);

							// Extract name from filename
							let name = child.basename;
							if (name.endsWith('.instructions')) {
								name = name.replace('.instructions', '');
							}

							instructions.push({
								name,
								applyTo: frontmatter.applyTo ? String(frontmatter.applyTo) : undefined,
								path: child.path,
								content: body,
							});
						} catch (error) {
							console.error(`Failed to load instruction from ${child.path}:`, error);
						}
					}
				}
			}
		}

		return instructions;
	}

	/**
	 * Get a single agent by name
	 */
	async getAgent(directories: string[], name: string): Promise<CustomAgent | undefined> {
		const agents = await this.loadAgents(directories);
		return agents.find(a => a.name === name);
	}
}
