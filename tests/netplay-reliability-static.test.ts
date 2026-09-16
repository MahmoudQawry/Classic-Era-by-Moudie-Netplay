import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

describe("NetPlay and voice reliability safeguards", () => {
  it("uses reliable input delivery without replaying stale controls", () => {
    const server = read("server/netplay.ts");
    const ps1 = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/Ps1NetplayClient.kt");
    const universal = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/UniversalNetplayClient.kt");
    expect(server).toContain('socket.to(channel).emit("netplay:ps1-input"');
    expect(server).toContain('socket.to(channel).emit("netplay:universal-input"');
    expect(server).not.toContain('socket.to(channel).volatile.emit("netplay:ps1-input"');
    expect(server).not.toContain('socket.to(channel).volatile.emit("netplay:universal-input"');
    expect(server).toContain("delay < 2 || delay > 45");
    expect(ps1).toContain('socket?.emit("netplay:ps1-input"');
    expect(universal).toContain('socket?.emit("netplay:universal-input"');
    expect(ps1).toContain("socket?.connected() == true");
    expect(universal).toContain("socket?.connected() != true");
    expect(ps1).toContain("delay in 2..45");
    expect(universal).toContain("delay in 2..45");
  });

  it("resets frame tracking when a verified session starts", () => {
    const server = read("server/netplay.ts");
    expect((server.match(/getFrameTracker\(session\.roomId\)\.delete\(session\.memberId\)/g) ?? []).length).toBe(2);
  });

  it("restricts signaling and guarantees a voice path (LiveKit or built-in mesh)", () => {
    const server = read("server/netplay.ts");
    const voice = read("components/room-voice-chat.native.tsx");
    expect(server).toContain("VOICE_SIGNAL_KINDS");
    expect(server).toContain("JSON.stringify(signal).length > 32_000");
    expect(voice).toContain("LiveKitRoom");
    expect(voice).toContain("serverUrl={mediaToken.url}");
    expect(voice).toContain("BuiltInVoiceControls");
    expect(voice).toContain("RTCPeerConnection");
    expect(voice).toContain("netplay:signal");
    expect(voice).toContain("netplay:voice-status");
    expect(voice).not.toContain("audio={true}");
  });
});
