/**
 * VoiceChatService - Main service orchestrating voice recording and transcription
 * Combines VoiceRecorder and WhisperService for end-to-end voice-to-text
 */

import { Notice } from 'obsidian';
import { VoiceRecorder } from './VoiceRecorder';
import { WhisperService } from './WhisperService';
import {
	RecordingState,
	TranscriptionResult,
	TranscriptionSegment,
	VoiceChatEvents,
	WhisperModel,
	WhisperServiceConfig,
	VoiceRecorderConfig,
} from './types';

export interface VoiceChatServiceConfig {
	/** Whisper configuration */
	whisper?: WhisperServiceConfig;
	/** Voice recorder configuration */
	recorder?: VoiceRecorderConfig;
	/** Show notices for status updates */
	showNotices?: boolean;
}

const DEFAULT_CONFIG: VoiceChatServiceConfig = {
	whisper: {
		model: 'base',
		language: 'en',
	},
	recorder: {
		maxDuration: 60000,
	},
	showNotices: true,
};

/**
 * VoiceChatService provides a unified interface for voice-to-text
 */
export class VoiceChatService {
	private config: VoiceChatServiceConfig;
	private recorder: VoiceRecorder;
	private whisper: WhisperService;
	private state: RecordingState = 'idle';
	private isInitialized: boolean = false;
	private listeners: Map<keyof VoiceChatEvents, Set<(...args: unknown[]) => void>> = new Map();

	constructor(config?: VoiceChatServiceConfig) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.recorder = new VoiceRecorder(this.config.recorder);
		this.whisper = new WhisperService(this.config.whisper);

		// Connect recorder state changes to our events
		this.recorder.setStateChangeCallback((recorderState) => {
			if (recorderState === 'recording' || recorderState === 'idle') {
				this.setState(recorderState);
			}
		});
	}

	/**
	 * Check if voice chat is supported
	 */
	async isSupported(): Promise<boolean> {
		const recorderSupported = await this.recorder.isSupported();
		if (!recorderSupported) {
			console.log('VoiceChatService: Recording not supported');
			return false;
		}

		// Note: We don't check Whisper support here as the module might not be installed yet
		// The actual check happens during initialization
		return true;
	}

	/**
	 * Initialize the service (loads Whisper model)
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) return;

		try {
			// Check if Whisper is supported
			const whisperSupported = await this.whisper.isSupported();
			if (!whisperSupported) {
				throw new Error('WebAssembly is not supported in this environment');
			}

			// Initialize Whisper with model loading progress
			if (this.config.showNotices) {
				new Notice('Loading voice recognition model...');
			}

			await this.whisper.initialize((progress) => {
				this.emit('modelProgress', progress);
			});

			this.isInitialized = true;

			if (this.config.showNotices) {
				new Notice('Voice recognition ready!');
			}
		} catch (error) {
			this.setState('error');
			this.emit('error', error instanceof Error ? error : new Error(String(error)));
			throw error;
		}
	}

	/**
	 * Start recording
	 */
	async startRecording(): Promise<void> {
		if (this.state === 'recording') {
			return;
		}

		try {
			// Ensure microphone permission
			const hasPermission = await this.recorder.requestPermission();
			if (!hasPermission) {
				throw new Error('Microphone permission denied');
			}

			// Initialize Whisper if not already done
			if (!this.isInitialized) {
				await this.initialize();
			}

			await this.recorder.startRecording();

			if (this.config.showNotices) {
				new Notice('Recording... Click again to stop');
			}
		} catch (error) {
			this.setState('error');
			this.emit('error', error instanceof Error ? error : new Error(String(error)));
			
			if (this.config.showNotices) {
				new Notice(`Recording failed: ${error instanceof Error ? error.message : String(error)}`);
			}
			throw error;
		}
	}

	/**
	 * Stop recording and transcribe
	 */
	async stopRecording(): Promise<TranscriptionResult> {
		if (this.state !== 'recording') {
			throw new Error('Not recording');
		}

		try {
			this.setState('processing');

			if (this.config.showNotices) {
				new Notice('Processing audio...');
			}

			// Stop recording and get audio data
			const recording = await this.recorder.stopRecording();

			// Transcribe the audio
			const result = await this.whisper.transcribe(
				recording.audioData,
				(segment) => {
					this.emit('segment', segment);
				}
			);

			this.setState('idle');

			if (this.config.showNotices && result.text) {
				new Notice('Transcription complete!');
			}

			return result;
		} catch (error) {
			this.setState('error');
			this.emit('error', error instanceof Error ? error : new Error(String(error)));
			
			if (this.config.showNotices) {
				new Notice(`Transcription failed: ${error instanceof Error ? error.message : String(error)}`);
			}
			throw error;
		}
	}

	/**
	 * Cancel recording without transcription
	 */
	cancelRecording(): void {
		this.recorder.cancelRecording();
		this.setState('idle');

		if (this.config.showNotices) {
			new Notice('Recording cancelled');
		}
	}

	/**
	 * Toggle recording (convenience method)
	 */
	async toggleRecording(): Promise<TranscriptionResult | null> {
		if (this.state === 'recording') {
			return await this.stopRecording();
		} else if (this.state === 'idle') {
			await this.startRecording();
			return null;
		}
		return null;
	}

	/**
	 * Get current state
	 */
	getState(): RecordingState {
		return this.state;
	}

	/**
	 * Check if initialized
	 */
	getIsInitialized(): boolean {
		return this.isInitialized;
	}

	/**
	 * Get available Whisper models
	 */
	async getAvailableModels(): Promise<{ id: WhisperModel; name: string; size: number }[]> {
		return await this.whisper.getAvailableModels();
	}

	/**
	 * Change the Whisper model
	 */
	async setModel(model: WhisperModel): Promise<void> {
		if (this.config.showNotices) {
			new Notice(`Loading ${model} model...`);
		}

		await this.whisper.setModel(model, (progress) => {
			this.emit('modelProgress', progress);
		});

		if (this.config.showNotices) {
			new Notice(`${model} model loaded!`);
		}
	}

	/**
	 * Subscribe to events
	 */
	on<K extends keyof VoiceChatEvents>(event: K, callback: VoiceChatEvents[K]): () => void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)!.add(callback as (...args: unknown[]) => void);

		// Return unsubscribe function
		return () => {
			this.listeners.get(event)?.delete(callback as (...args: unknown[]) => void);
		};
	}

	private emit<K extends keyof VoiceChatEvents>(event: K, ...args: Parameters<VoiceChatEvents[K]>): void {
		const callbacks = this.listeners.get(event);
		if (callbacks) {
			for (const callback of callbacks) {
				try {
					callback(...args);
				} catch (error) {
					console.error(`VoiceChatService: Error in ${event} listener:`, error);
				}
			}
		}
	}

	private setState(newState: RecordingState): void {
		if (this.state !== newState) {
			this.state = newState;
			this.emit('stateChange', newState);
		}
	}

	/**
	 * Clear model cache
	 */
	async clearCache(): Promise<void> {
		await this.whisper.clearCache();
		this.isInitialized = false;

		if (this.config.showNotices) {
			new Notice('Voice model cache cleared');
		}
	}

	/**
	 * Destroy the service
	 */
	destroy(): void {
		this.recorder.destroy();
		this.whisper.destroy();
		this.listeners.clear();
		this.isInitialized = false;
		this.state = 'idle';
	}
}
