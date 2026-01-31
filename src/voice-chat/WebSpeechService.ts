/**
 * WebSpeechService - Speech-to-text using native Web Speech API
 * Uses the browser's built-in speech recognition (Chromium/Electron)
 */

import {
	TranscriptionResult,
	TranscriptionSegment,
} from './types';

// Web Speech API types (not all browsers expose these)
interface SpeechRecognitionEvent extends Event {
	results: SpeechRecognitionResultList;
	resultIndex: number;
}

interface SpeechRecognitionResultList {
	length: number;
	item(index: number): SpeechRecognitionResult;
	[index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
	isFinal: boolean;
	length: number;
	item(index: number): SpeechRecognitionAlternative;
	[index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
	transcript: string;
	confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
	error: string;
	message?: string;
}

interface SpeechRecognition extends EventTarget {
	continuous: boolean;
	interimResults: boolean;
	lang: string;
	maxAlternatives: number;
	start(): void;
	stop(): void;
	abort(): void;
	onresult: ((event: SpeechRecognitionEvent) => void) | null;
	onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
	onend: (() => void) | null;
	onstart: (() => void) | null;
}

interface SpeechRecognitionConstructor {
	new(): SpeechRecognition;
}

declare global {
	interface Window {
		SpeechRecognition?: SpeechRecognitionConstructor;
		webkitSpeechRecognition?: SpeechRecognitionConstructor;
	}
}

export interface WebSpeechConfig {
	/** Language code (e.g., 'en-US', 'es-ES') */
	language?: string;
	/** Return interim results as they come in */
	interimResults?: boolean;
	/** Continue listening after each result */
	continuous?: boolean;
}

const DEFAULT_CONFIG: Required<WebSpeechConfig> = {
	language: 'en-US',
	interimResults: true,
	continuous: true,
};

/**
 * WebSpeechService provides speech-to-text using native Web Speech API
 */
export class WebSpeechService {
	private config: Required<WebSpeechConfig>;
	private recognition: SpeechRecognition | null = null;
	private isListening: boolean = false;
	private SpeechRecognitionClass: SpeechRecognitionConstructor | null = null;

	constructor(config?: WebSpeechConfig) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.detectSpeechRecognition();
	}

	private detectSpeechRecognition(): void {
		// Electron/Obsidian uses Chromium, so webkitSpeechRecognition should be available
		if (typeof window !== 'undefined') {
			this.SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition || null;
		}
	}

	/**
	 * Check if Web Speech API is supported
	 */
	async isSupported(): Promise<boolean> {
		return this.SpeechRecognitionClass !== null;
	}

	/**
	 * Initialize the service (no-op for Web Speech API)
	 */
	async initialize(): Promise<void> {
		if (!this.SpeechRecognitionClass) {
			throw new Error('Web Speech API is not supported in this environment');
		}
		console.log('WebSpeechService: Initialized (using native Web Speech API)');
	}

	/**
	 * Start listening for speech and return transcription when done
	 * Listens live using the browser's speech recognition
	 */
	startListening(onSegment?: (segment: TranscriptionSegment) => void): Promise<TranscriptionResult> {
		return new Promise((resolve, reject) => {
			if (!this.SpeechRecognitionClass) {
				reject(new Error('Web Speech API not supported'));
				return;
			}

			if (this.isListening) {
				reject(new Error('Already listening'));
				return;
			}

			const recognition = new this.SpeechRecognitionClass();
			this.recognition = recognition;

			recognition.continuous = this.config.continuous;
			recognition.interimResults = this.config.interimResults;
			recognition.lang = this.config.language;

			const segments: TranscriptionSegment[] = [];
			const startTime = Date.now();
			let finalTranscript = '';

			recognition.onstart = () => {
				this.isListening = true;
				console.log('WebSpeechService: Started listening');
			};

			recognition.onresult = (event: SpeechRecognitionEvent) => {
				let interimTranscript = '';

				for (let i = event.resultIndex; i < event.results.length; i++) {
					const result = event.results[i];
					if (result) {
						const alternative = result[0];
						if (alternative) {
							if (result.isFinal) {
								finalTranscript += alternative.transcript + ' ';
								const segment: TranscriptionSegment = {
									text: alternative.transcript,
									timeStart: Date.now() - startTime,
									timeEnd: Date.now() - startTime,
								};
								segments.push(segment);
								onSegment?.(segment);
							} else {
								interimTranscript += alternative.transcript;
								// Emit interim results if callback provided
								if (onSegment && interimTranscript) {
									onSegment({
										text: interimTranscript,
										timeStart: Date.now() - startTime,
										timeEnd: Date.now() - startTime,
									});
								}
							}
						}
					}
				}
			};

			recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
				console.error('WebSpeechService: Error:', event.error);
				this.isListening = false;
				this.recognition = null;

				// If we got some text, return it anyway
				if (finalTranscript.trim()) {
					resolve({
						text: finalTranscript.trim(),
						segments,
						transcribeDurationMs: Date.now() - startTime,
					});
				} else {
					reject(new Error(`Speech recognition error: ${event.error}`));
				}
			};

			recognition.onend = () => {
				this.isListening = false;
				this.recognition = null;
				console.log('WebSpeechService: Stopped listening');

				resolve({
					text: finalTranscript.trim(),
					segments,
					transcribeDurationMs: Date.now() - startTime,
				});
			};

			try {
				recognition.start();
			} catch (error) {
				this.isListening = false;
				reject(error);
			}
		});
	}

	/**
	 * Stop listening and return the transcription
	 */
	stopListening(): void {
		if (this.recognition && this.isListening) {
			this.recognition.stop();
		}
	}

	/**
	 * Abort listening without returning results
	 */
	abortListening(): void {
		if (this.recognition) {
			this.recognition.abort();
			this.isListening = false;
			this.recognition = null;
		}
	}

	/**
	 * Check if currently listening
	 */
	getIsListening(): boolean {
		return this.isListening;
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<WebSpeechConfig>): void {
		this.config = { ...this.config, ...config };
	}

	/**
	 * Clean up resources
	 */
	destroy(): void {
		this.abortListening();
	}
}
