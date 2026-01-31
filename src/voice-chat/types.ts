/**
 * Voice Chat Types
 * Type definitions for voice recording and transcription
 */

/**
 * Recording state for the voice recorder
 */
export type RecordingState = 'idle' | 'recording' | 'processing' | 'error';

/**
 * Configuration for the voice recorder
 */
export interface VoiceRecorderConfig {
	/** Sample rate for audio recording (default: 16000 for Whisper) */
	sampleRate?: number;
	/** Number of audio channels (default: 1 for mono) */
	channels?: number;
	/** Maximum recording duration in milliseconds (default: 60000 = 1 minute) */
	maxDuration?: number;
}

/**
 * Result from audio recording
 */
export interface RecordingResult {
	/** Audio data as Float32Array at 16kHz */
	audioData: Float32Array;
	/** Duration of the recording in milliseconds */
	durationMs: number;
}

/**
 * Configuration for the Whisper service
 */
export interface WhisperServiceConfig {
	/** Model to use (tiny, base, small, medium, large) */
	model?: WhisperModel;
	/** Language code for transcription (e.g., 'en', 'es', 'auto') */
	language?: string;
	/** Number of threads for processing */
	threads?: number;
	/** Whether to translate to English */
	translate?: boolean;
	/** Log level (0-3) */
	logLevel?: number;
}

/**
 * Available Whisper models
 */
export type WhisperModel = 'tiny' | 'base' | 'small' | 'medium' | 'large';

/**
 * Transcription segment from Whisper
 */
export interface TranscriptionSegment {
	/** Segment text */
	text: string;
	/** Start time in milliseconds */
	timeStart: number;
	/** End time in milliseconds */
	timeEnd: number;
}

/**
 * Result from transcription
 */
export interface TranscriptionResult {
	/** Full transcribed text */
	text: string;
	/** Individual segments */
	segments: TranscriptionSegment[];
	/** Time taken to transcribe in milliseconds */
	transcribeDurationMs: number;
	/** Detected language (if auto-detect was used) */
	detectedLanguage?: string;
}

/**
 * Progress callback for model loading
 */
export type ModelLoadProgressCallback = (progress: number) => void;

/**
 * Callback for transcription segments (streaming)
 */
export type TranscriptionSegmentCallback = (segment: TranscriptionSegment) => void;

/**
 * Voice chat service interface
 */
export interface IVoiceChatService {
	/** Check if voice input is supported */
	isSupported(): Promise<boolean>;
	/** Initialize the service */
	initialize(): Promise<void>;
	/** Start recording */
	startRecording(): Promise<void>;
	/** Stop recording and get transcription */
	stopRecording(): Promise<TranscriptionResult>;
	/** Cancel recording without transcription */
	cancelRecording(): void;
	/** Get current recording state */
	getState(): RecordingState;
	/** Clean up resources */
	destroy(): void;
}

/**
 * Events emitted by the voice chat service
 */
export interface VoiceChatEvents {
	/** Recording state changed */
	stateChange: (state: RecordingState) => void;
	/** Transcription segment received (streaming) */
	segment: (segment: TranscriptionSegment) => void;
	/** Error occurred */
	error: (error: Error) => void;
	/** Model loading progress */
	modelProgress: (progress: number) => void;
}
