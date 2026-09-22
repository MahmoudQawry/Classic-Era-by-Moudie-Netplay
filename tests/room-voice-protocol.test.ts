import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("room voice transport", () => {
  it("uses LiveKit for media and Socket.IO only for room control", () => {
    const client = read("components/room-voice-chat-reliable.native.tsx");
    const socketIo = read("server/netplay.ts");
    expect(client).toContain('from "@livekit/react-native"');
    expect(client).toContain('from "livekit-client"');
    expect(client).toContain("AudioSession.startAudioSession");
    expect(client).toContain('RoomEvent.Reconnecting');
    expect(socketIo).toContain('socket.on("netplay:voice-status"');
  });

  it("keeps separate room and team voice authorization paths", () => {
    const client = read("components/room-voice-chat-reliable.native.tsx");
    const livekit = read("server/livekit.ts");
    expect(client).toContain("teamMediaToken");
    expect(client).toContain('voiceChannel === "team"');
    expect(livekit).toContain("canPublish");
    expect(livekit).toContain("canSubscribe");
  });
});
