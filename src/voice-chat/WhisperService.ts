/**
 * WhisperService - Whisper.wasm integration for local speech-to-text
 * Uses @timur00kh/whisper.wasm for browser-based transcription
 */

import {
	WhisperServiceConfig,
	WhisperModel,
	TranscriptionResult,
	TranscriptionSegment,
	ModelLoadProgressCallback,
} from './types';

// Dynamic import types for whisper.wasm
interface WhisperWasmModule {
	WhisperWasmService: new (options?: { logLevel?: number; init?: boolean }) => WhisperWasmServiceInstance;
	ModelManager: new () => ModelManagerInstance;
}

interface WhisperWasmServiceInstance {
	checkWasmSupport(): Promise<boolean>;
	initModel(model: Uint8Array): Promise<void>;
	transcribe(
		audioData: Float32Array,
		callback?: (segment: WhisperSegment) => void,
		options?: WhisperTranscribeOptions
	): Promise<WhisperTranscribeResult>;
	createSession(): WhisperSession;
}

interface ModelManagerInstance {
	getAvailableModels(): Promise<ModelInfo[]>;
	loadModel(modelId: string, useCache?: boolean, onProgress?: (progress: number) => void): Promise<Uint8Array>;
	clearCache(): Promise<void>;
}

interface ModelInfo {
	id: string;
	name: string;
	size: number;
}

interface WhisperSegment {
	text: string;
	timeStart: number;
	timeEnd: number;
}

interface WhisperTranscribeOptions {
	language?: string;
	threads?: number;
	translate?: boolean;
}

interface WhisperTranscribeResult {
	segments: WhisperSegment[];
	transcribeDurationMs: number;
}

interface WhisperSession {
	streamimg(
		audioData: Float32Array,
		options?: WhisperTranscribeOptions & { sleepMsBetweenChunks?: number }
	): AsyncIterableIterator<WhisperSegment>;
}

const DEFAULT_CONFIG: Required<WhisperServiceConfig> = {
	model: 'base',
	language: 'en',
	threads: 4,
	translate: false,
	logLevel: 1,
};

/**
 * WhisperService provides local speech-to-text using Whisper.wasm
 */
export class WhisperService {
	private config: Required<WhisperServiceConfig>;
	private whisperModule: WhisperWasmModule | null = null;
	private whisperService: WhisperWasmServiceInstance | null = null;
	private modelManager: ModelManagerInstance | null = null;
	private isModelLoaded: boolean = false;
	private currentModel: WhisperModel | null = null;

	constructor(config?: WhisperServiceConfig) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Check if Whisper.wasm is supported in the current environment
	 */
	async isSupported(): Promise<boolean> {
		try {
			// Check for WebAssembly support
			if (typeof WebAssembly === 'undefined') return false;
			
			// Try to load the module and check WASM support
			await this.loadModule();
			if (!this.whisperService) return false;
			
			return await this.whisperService.checkWasmSupport();
		} catch {
			return false;
		}
	}

	/**
	 * Dynamically load the whisper.wasm module
	 */
	private async loadModule(): Promise<void> {
		if (this.whisperModule) return;

		try {
			// Dynamic import of the whisper.wasm package
			this.whisperModule = await import('@timur00kh/whisper.wasm') as WhisperWasmModule;
			
			// Initialize services
			this.whisperService = new this.whisperModule.WhisperWasmService({
				logLevel: this.config.logLevel,
			});
			this.modelManager = new this.whisperModule.ModelManager();
		} catch (error) {
			console.error('WhisperService: Failed to load whisper.wasm module:', error);
			throw new Error(
				'Failed to load Whisper.wasm. Make sure @timur00kh/whisper.wasm is installed: ' +
				'npm install @timur00kh/whisper.wasm@canary'
			);
		}
	}

	/**
	 * Initialize the service and load the model
	 */
	async initialize(onProgress?: ModelLoadProgressCallback): Promise<void> {
		await this.loadModule();

		if (!this.modelManager || !this.whisperService) {
			throw new Error('WhisperService: Module not loaded');
		}

		// Load the model if not already loaded or if model changed
		if (!this.isModelLoaded || this.currentModel !== this.config.model) {
			console.log(`WhisperService: Loading ${this.config.model} model...`);
			
			const modelData = await this.modelManager.loadModel(
				this.config.model,
				true, // Use cache
				onProgress
			);

			await this.whisperService.initModel(modelData);
			this.isModelLoaded = true;
			this.currentModel = this.config.model;
			
			console.log('WhisperService: Model loaded successfully');
		}
	}

	/**
	 * Transcribe audio data to text
	 */
	async transcribe(
		audioData: Float32Array,
		onSegment?: (segment: TranscriptionSegment) => void
	): Promise<TranscriptionResult> {
		if (!this.whisperService || !this.isModelLoaded) {
			throw new Error('WhisperService: Service not initialized. Call initialize() first.');
		}

		const segments: TranscriptionSegment[] = [];

		const result = await this.whisperService.transcribe(
			audioData,
			(segment) => {
				const transcriptionSegment: TranscriptionSegment = {
					text: segment.text,
					timeStart: segment.timeStart,
					timeEnd: segment.timeEnd,
				};
				segments.push(transcriptionSegment);
				onSegment?.(transcriptionSegment);
			},
			{
				language: this.config.language,
				threads: this.config.threads,
				translate: this.config.translate,
			}
		);

		// Combine all segments into full text
		const fullText = segments.map(s => s.text).join(' ').trim();

		return {
			text: fullText,
			segments,
			transcribeDurationMs: result.transcribeDurationMs,
		};
	}

	/**
	 * Transcribe audio with streaming (async iterator)
	 */
	async *transcribeStreaming(
		audioData: Float32Array
	): AsyncGenerator<TranscriptionSegment, TranscriptionResult, unknown> {
		if (!this.whisperService || !this.isModelLoaded) {
			throw new Error('WhisperService: Service not initialized. Call initialize() first.');
		}

		const session = this.whisperService.createSession();
		const segments: TranscriptionSegment[] = [];
		const startTime = Date.now();

		const stream = session.streamimg(audioData, {
			language: this.config.language,
			threads: this.config.threads,
			translate: this.config.translate,
			sleepMsBetweenChunks: 100,
		});

		for await (const segment of stream) {
			const transcriptionSegment: TranscriptionSegment = {
				text: segment.text,
				timeStart: segment.timeStart,
				timeEnd: segment.timeEnd,
			};
			segments.push(transcriptionSegment);
			yield transcriptionSegment;
		}

		const fullText = segments.map(s => s.text).join(' ').trim();

		return {
			text: fullText,
			segments,
			transcribeDurationMs: Date.now() - startTime,
		};
	}

	/**
	 * Get available models
	 */
	async getAvailableModels(): Promise<{ id: WhisperModel; name: string; size: number }[]> {
		await this.loadModule();

		if (!this.modelManager) {
			throw new Error('WhisperService: Module not loaded');
		}

		const models = await this.modelManager.getAvailableModels();
		return models.map(m => ({
			id: m.id as WhisperModel,
			name: m.name,
			size: m.size,
		}));
	}

	/**
	 * Change the model
	 */
	async setModel(model: WhisperModel, onProgress?: ModelLoadProgressCallback): Promise<void> {
		this.config.model = model;
		this.isModelLoaded = false;
		await this.initialize(onProgress);
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<WhisperServiceConfig>): void {
		const modelChanged = config.model && config.model !== this.config.model;
		this.config = { ...this.config, ...config };
		
		if (modelChanged) {
			this.isModelLoaded = false;
		}
	}

	/**
	 * Clear the model cache
	 */
	async clearCache(): Promise<void> {
		if (this.modelManager) {
			await this.modelManager.clearCache();
			this.isModelLoaded = false;
			this.currentModel = null;
		}
	}

	/**
	 * Clean up resources
	 */
	destroy(): void {
		this.whisperService = null;
		this.modelManager = null;
		this.whisperModule = null;
		this.isModelLoaded = false;
		this.currentModel = null;
	}
}
