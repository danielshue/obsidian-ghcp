/**
 * Voice Chat Module
 * Provides voice-to-text functionality using Whisper.wasm
 */

export { VoiceRecorder } from './VoiceRecorder';
export { WhisperService } from './WhisperService';
export { VoiceChatService, type VoiceChatServiceConfig } from './VoiceChatService';
export type {
	RecordingState,
	VoiceRecorderConfig,
	RecordingResult,
	WhisperServiceConfig,
	WhisperModel,
	TranscriptionSegment,
	TranscriptionResult,
	ModelLoadProgressCallback,
	TranscriptionSegmentCallback,
	IVoiceChatService,
	VoiceChatEvents,
} from './types';
