import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("room voice signalling protocol", () => {
  it("uses LiveKit as the only production voice transport", () => {
    const client = read("components/room-voice-chat-reliable.native.tsx");
    const server = read("server/livekit.ts");
    const app = read("android/app/src/main/java/com/app/moudienetplay/MainApplication.kt");
    expect(client).toContain("LiveKitRoom");
    expect(client).toContain("AudioSession.startAudioSession");
    expect(client).toContain("RoomEvent.Reconnecting");
    expect(server).toContain("new AccessToken");
    expect(server).toContain("canPublish");
    expect(app).toContain("LiveKitReactNative.setup");
  });

  it("relies on LiveKit managed reconnection instead of WebRTC peer recovery", () => {
    const client = read("components/room-voice-chat-reliable.native.tsx");
    expect(client).toContain("RoomEvent.Reconnected");
    expect(client).toContain("RoomEvent.Reconnecting");
    expect(client).not.toContain("RTCPeerConnection");
    expect(client).not.toContain('state==="failed"');
  });
});
