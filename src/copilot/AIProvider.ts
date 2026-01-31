/**
 * AIProvider - Abstract interface for AI chat providers
 * Supports GitHub Copilot, OpenAI, and future providers
 */

import { App } from "obsidian";
import { ChatMessage } from "./CopilotService";

export type AIProviderType = "copilot" | "openai";

export interface AIProviderConfig {
	/** Provider type */
	provider: AIProviderType;
	/** Model to use */
	model: string;
	/** Enable streaming responses */
	streaming: boolean;
	/** System prompt/message */
	systemMessage?: string;
}

export interface OpenAIProviderConfig extends AIProviderConfig {
	provider: "openai";
	/** OpenAI API key (optional if OPENAI_API_KEY env var is set) */
	apiKey?: string;
	/** OpenAI API base URL (for Azure or custom endpoints) */
	baseURL?: string;
	/** Organization ID (optional) */
	organization?: string;
	/** Max tokens for completion */
	maxTokens?: number;
	/** Temperature (0-2) */
	temperature?: number;
}

export interface CopilotProviderConfig extends AIProviderConfig {
	provider: "copilot";
	/** Path to Copilot CLI */
	cliPath?: string;
	/** URL for Copilot CLI */
	cliUrl?: string;
}

export interface StreamingCallbacks {
	onDelta: (delta: string) => void;
	onComplete?: (fullContent: string) => void;
	onError?: (error: Error) => void;
}

export interface ToolDefinition {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
	handler: (args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Abstract base class for AI providers
 */
export abstract class AIProvider {
	protected app: App;
	protected config: AIProviderConfig;
	protected messageHistory: ChatMessage[] = [];
	protected tools: ToolDefinition[] = [];
	protected systemPrompt: string = "";

	constructor(app: App, config: AIProviderConfig) {
		this.app = app;
		this.config = config;
	}

	/**
	 * Initialize the provider
	 */
	abstract initialize(): Promise<void>;

	/**
	 * Send a message and wait for complete response
	 */
	abstract sendMessage(prompt: string): Promise<string>;

	/**
	 * Send a message with streaming response
	 */
	abstract sendMessageStreaming(
		prompt: string,
		callbacks: StreamingCallbacks
	): Promise<void>;

	/**
	 * Abort the current operation
	 */
	abstract abort(): Promise<void>;

	/**
	 * Check if the provider is connected/ready
	 */
	abstract isReady(): boolean;

	/**
	 * Clean up resources
	 */
	abstract destroy(): Promise<void>;

	/**
	 * Set the system prompt
	 */
	setSystemPrompt(prompt: string): void {
		this.systemPrompt = prompt;
	}

	/**
	 * Set available tools
	 */
	setTools(tools: ToolDefinition[]): void {
		this.tools = tools;
	}

	/**
	 * Get message history
	 */
	getMessageHistory(): ChatMessage[] {
		return [...this.messageHistory];
	}

	/**
	 * Clear message history
	 */
	clearHistory(): void {
		this.messageHistory = [];
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<AIProviderConfig>): void {
		this.config = { ...this.config, ...config };
	}

	/**
	 * Get the provider type
	 */
	getProviderType(): AIProviderType {
		return this.config.provider;
	}

	/**
	 * Get the current model
	 */
	getModel(): string {
		return this.config.model;
	}

	protected addToHistory(role: "user" | "assistant", content: string): void {
		this.messageHistory.push({
			role,
			content,
			timestamp: new Date(),
		});
	}
}

/**
 * Available OpenAI models
 */
export const OPENAI_MODELS = [
	// GPT-4 models
	{ value: "gpt-4o", name: "GPT-4o", description: "Most capable GPT-4 model" },
	{ value: "gpt-4o-mini", name: "GPT-4o Mini", description: "Affordable small model" },
	{ value: "gpt-4-turbo", name: "GPT-4 Turbo", description: "Latest GPT-4 Turbo" },
	{ value: "gpt-4", name: "GPT-4", description: "Original GPT-4" },
	// GPT-3.5 models
	{ value: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", description: "Fast and affordable" },
	// o1 reasoning models
	{ value: "o1", name: "o1", description: "Complex reasoning model" },
	{ value: "o1-mini", name: "o1-mini", description: "Fast reasoning model" },
	{ value: "o1-preview", name: "o1 Preview", description: "Preview reasoning model" },
	// o3 models (if available)
	{ value: "o3-mini", name: "o3-mini", description: "Efficient reasoning" },
];

/**
 * Get API key from environment or config
 */
export function getOpenAIApiKey(configKey?: string): string | undefined {
	// First check config
	if (configKey) {
		return configKey;
	}
	
	// Then check environment variables (works in Node.js context)
	// In Obsidian, we can access process.env
	if (typeof process !== "undefined" && process.env) {
		return process.env.OPENAI_API_KEY;
	}
	
	return undefined;
}
