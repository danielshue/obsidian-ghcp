/**
 * Voice Chat Module
 * Provides voice-to-text functionality using:
 * - OpenAI Whisper API (MediaRecorder + OpenAI API) - recommended
 * - Local whisper.cpp server (MediaRecorder + REST API)
 */

export { LocalWhisperService, type LocalWhisperConfig } from './LocalWhisperService';
export { OpenAIWhisperService, type OpenAIWhisperConfig } from './OpenAIWhisperService';
export { VoiceChatService, type VoiceChatServiceConfig, type VoiceBackend } from './VoiceChatService';
export type {
	RecordingState,
	TranscriptionSegment,
	TranscriptionResult,
	TranscriptionSegmentCallback,
	IVoiceChatService,
	VoiceChatEvents,
} from './types';
