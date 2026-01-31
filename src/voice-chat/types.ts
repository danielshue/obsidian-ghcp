/**
 * Voice Chat Types
 * Type definitions for voice recording and transcription
 */

/**
 * Recording state for the voice recorder
 */
export type RecordingState = 'idle' | 'recording' | 'processing' | 'error';

/**
 * Transcription segment
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
}

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
}
