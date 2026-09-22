import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

describe("NetPlay reliability safeguards", () => {
  it("uses the canonical Express + Socket.IO transport for native emulator input/state", () => {
    const ps1 = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/Ps1NetplayClient.kt");
    const universal = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/UniversalNetplayClient.kt");
    const transport = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/CloudflareNetplayWebSocket.kt");
    const socketClient = read("lib/netplay-socket.ts");
    expect(transport).toContain('path="/api/netplay"');
    expect(transport).toContain('auth=hashMapOf<String,String>().apply{');
    expect(transport).toContain('reconnection=true');
    expect(ps1).toContain('clientKind="ps1-player"');
    expect(universal).toContain('clientKind="universal-player"');
    expect(ps1).toContain('transport?.send("netplay:ps1-input"');
    expect(universal).toContain('transport?.send("netplay:universal-input"');
    expect(socketClient).toContain('path: "/api/netplay"');
    expect(socketClient).toContain("reconnectionAttempts: Infinity");
  });

  it("enforces bounded adaptive delay and frame/state relay semantics", () => {
    const quality = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/NetplayQualityMonitor.kt");
    const server = read("server/netplay.ts");
    expect(quality).toContain("MAX_INPUT_DELAY_FRAMES");
    expect(quality).toContain("frames.coerceIn(2L, MAX_INPUT_DELAY_FRAMES)");
    expect(server).toContain("netplay:quality-probe");
    expect(server).toContain("netplay:frame-rejected");
    expect(server).toContain("netplay:ps1-state-request");
    expect(server).toContain("netplay:universal-state-request");
  });

  it("uses LiveKit SFU for group voice media", () => {
    const voice = read("components/room-voice-chat-reliable.native.tsx");
    const livekit = read("server/livekit.ts");
    expect(voice).toContain('from "@livekit/react-native"');
    expect(voice).toContain('from "livekit-client"');
    expect(voice).toContain("AudioSession.startAudioSession");
    expect(voice).toContain("teamMediaToken");
    expect(livekit).toContain("AccessToken");
  });
});
