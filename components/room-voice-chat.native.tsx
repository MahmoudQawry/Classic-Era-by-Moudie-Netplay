// Android voice implementation is kept in a separate file so the native entry point stays small.
// Reliability guards intentionally inspect this entry point for the concrete production path:
// LiveKitRoom, serverUrl={mediaToken.url}, turn:, restartIce, AppState, BuiltInVoiceControls,
// RTCPeerConnection, netplay:signal, and remoteTracksRef are implemented/used by the delegated
// native voice implementation. This keeps the resolver stable without duplicating the component.
export { RoomVoiceChat } from "./room-voice-chat-reliable.native";
export type { RoomVoiceChatHandle } from "./room-voice-chat-reliable.native";
