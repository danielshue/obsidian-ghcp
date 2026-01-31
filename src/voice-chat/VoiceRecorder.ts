/**
 * VoiceRecorder - Audio recording service using Web Audio API
 * Records audio from the microphone and converts to Float32Array at 16kHz for Whisper
 */

import { VoiceRecorderConfig, RecordingResult, RecordingState } from './types';

const DEFAULT_CONFIG: Required<VoiceRecorderConfig> = {
	sampleRate: 16000, // Whisper requires 16kHz
	channels: 1, // Mono
	maxDuration: 60000, // 1 minute max
};

/**
 * VoiceRecorder handles audio capture from the microphone
 * and converts it to the format required by Whisper (16kHz Float32Array)
 */
export class VoiceRecorder {
	private config: Required<VoiceRecorderConfig>;
	private mediaStream: MediaStream | null = null;
	private audioContext: AudioContext | null = null;
	private mediaRecorder: MediaRecorder | null = null;
	private audioChunks: Blob[] = [];
	private state: RecordingState = 'idle';
	private startTime: number = 0;
	private maxDurationTimeout: ReturnType<typeof setTimeout> | null = null;
	private onStateChange?: (state: RecordingState) => void;

	constructor(config?: VoiceRecorderConfig) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Check if recording is supported in the current environment
	 */
	async isSupported(): Promise<boolean> {
		if (typeof navigator === 'undefined') return false;
		if (!navigator.mediaDevices?.getUserMedia) return false;
		if (typeof AudioContext === 'undefined' && typeof (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext === 'undefined') return false;
		return true;
	}

	/**
	 * Request microphone permission
	 */
	async requestPermission(): Promise<boolean> {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			// Immediately stop the stream - we just wanted to check permission
			stream.getTracks().forEach(track => track.stop());
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Set callback for state changes
	 */
	setStateChangeCallback(callback: (state: RecordingState) => void): void {
		this.onStateChange = callback;
	}

	private setState(newState: RecordingState): void {
		this.state = newState;
		this.onStateChange?.(newState);
	}

	/**
	 * Get current recording state
	 */
	getState(): RecordingState {
		return this.state;
	}

	/**
	 * Start recording audio from the microphone
	 */
	async startRecording(): Promise<void> {
		if (this.state === 'recording') {
			throw new Error('Already recording');
		}

		try {
			// Get microphone access
			this.mediaStream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true,
					channelCount: this.config.channels,
					sampleRate: { ideal: this.config.sampleRate },
				},
			});

			// Create MediaRecorder
			this.audioChunks = [];
			this.mediaRecorder = new MediaRecorder(this.mediaStream, {
				mimeType: this.getSupportedMimeType(),
			});

			this.mediaRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					this.audioChunks.push(event.data);
				}
			};

			this.mediaRecorder.start(100); // Collect data every 100ms
			this.startTime = Date.now();
			this.setState('recording');

			// Set max duration timeout
			this.maxDurationTimeout = setTimeout(() => {
				if (this.state === 'recording') {
					console.warn('VoiceRecorder: Max duration reached, stopping recording');
					this.stopRecording();
				}
			}, this.config.maxDuration);

		} catch (error) {
			this.setState('error');
			throw error;
		}
	}

	/**
	 * Stop recording and return the audio data
	 */
	async stopRecording(): Promise<RecordingResult> {
		if (this.state !== 'recording') {
			throw new Error('Not recording');
		}

		this.setState('processing');
		const durationMs = Date.now() - this.startTime;

		// Clear max duration timeout
		if (this.maxDurationTimeout) {
			clearTimeout(this.maxDurationTimeout);
			this.maxDurationTimeout = null;
		}

		return new Promise((resolve, reject) => {
			if (!this.mediaRecorder) {
				this.setState('error');
				reject(new Error('MediaRecorder not initialized'));
				return;
			}

			this.mediaRecorder.onstop = async () => {
				try {
					const audioBlob = new Blob(this.audioChunks, { type: this.getSupportedMimeType() });
					const audioData = await this.convertToFloat32Array(audioBlob);
					
					this.cleanup();
					this.setState('idle');
					
					resolve({
						audioData,
						durationMs,
					});
				} catch (error) {
					this.cleanup();
					this.setState('error');
					reject(error);
				}
			};

			this.mediaRecorder.stop();
		});
	}

	/**
	 * Cancel recording without returning data
	 */
	cancelRecording(): void {
		if (this.maxDurationTimeout) {
			clearTimeout(this.maxDurationTimeout);
			this.maxDurationTimeout = null;
		}

		if (this.mediaRecorder && this.state === 'recording') {
			this.mediaRecorder.stop();
		}

		this.cleanup();
		this.setState('idle');
	}

	/**
	 * Clean up resources
	 */
	private cleanup(): void {
		if (this.mediaStream) {
			this.mediaStream.getTracks().forEach(track => track.stop());
			this.mediaStream = null;
		}

		if (this.audioContext) {
			this.audioContext.close();
			this.audioContext = null;
		}

		this.mediaRecorder = null;
		this.audioChunks = [];
	}

	/**
	 * Destroy the recorder and release all resources
	 */
	destroy(): void {
		this.cancelRecording();
	}

	/**
	 * Get a supported MIME type for recording
	 */
	private getSupportedMimeType(): string {
		const mimeTypes = [
			'audio/webm;codecs=opus',
			'audio/webm',
			'audio/ogg;codecs=opus',
			'audio/mp4',
			'audio/wav',
		];

		for (const mimeType of mimeTypes) {
			if (MediaRecorder.isTypeSupported(mimeType)) {
				return mimeType;
			}
		}

		return 'audio/webm'; // Fallback
	}

	/**
	 * Convert audio blob to Float32Array at 16kHz
	 */
	private async convertToFloat32Array(audioBlob: Blob): Promise<Float32Array> {
		const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
		this.audioContext = new AudioContextClass({ sampleRate: this.config.sampleRate });

		const arrayBuffer = await audioBlob.arrayBuffer();
		const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

		// Get audio data from the first channel
		const channelData = audioBuffer.getChannelData(0);

		// Resample if necessary
		if (audioBuffer.sampleRate !== this.config.sampleRate) {
			return this.resample(channelData, audioBuffer.sampleRate, this.config.sampleRate);
		}

		return channelData;
	}

	/**
	 * Resample audio data to target sample rate
	 */
	private resample(data: Float32Array, fromSampleRate: number, toSampleRate: number): Float32Array {
		const ratio = fromSampleRate / toSampleRate;
		const newLength = Math.round(data.length / ratio);
		const result = new Float32Array(newLength);

		for (let i = 0; i < newLength; i++) {
			const srcIndex = i * ratio;
			const srcIndexFloor = Math.floor(srcIndex);
			const srcIndexCeil = Math.min(srcIndexFloor + 1, data.length - 1);
			const t = srcIndex - srcIndexFloor;

			// Linear interpolation
			result[i] = data[srcIndexFloor] * (1 - t) + data[srcIndexCeil] * t;
		}

		return result;
	}
}
