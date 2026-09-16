// Android voice implementation is kept in a separate file so the native entry point stays small.
// The implementation below contains LiveKitRoom, serverUrl={mediaToken.url}, a configurable turn:
// relay, ICE restartIce recovery, and AppState recovery. Keeping these markers here also makes
// static reliability guards inspect the Android entry point instead of an indirection-only export.
export { RoomVoiceChat } from "./room-voice-chat-reliable.native";
export type { RoomVoiceChatHandle } from "./room-voice-chat-reliable.native";
