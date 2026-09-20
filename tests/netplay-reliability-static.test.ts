import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

describe("NetPlay and voice reliability safeguards", () => {
  it("uses the Cloudflare Durable Object WebSocket transport for emulator input/state", () => {
    const worker = read("cloudflare-netplay/src/index.ts");
    const ps1 = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/Ps1NetplayClient.kt");
    const universal = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/UniversalNetplayClient.kt");
    const transport = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/CloudflareNetplayWebSocket.kt");
    expect(worker).toContain('this.ctx.acceptWebSocket(server)');
    expect(worker).toContain('async webSocketMessage');
    expect(worker).toContain('netplay:universal-input');
    expect(worker).toContain('netplay:ps1-input');
    expect(ps1).toContain('CloudflareNetplayWebSocket');
    expect(universal).toContain('CloudflareNetplayWebSocket');
    expect(ps1).toContain('transport?.send("netplay:ps1-input"');
    expect(universal).toContain('transport?.send("netplay:universal-input"');
    expect(transport).toContain('/ws/room/');
    expect(transport).toContain('netplay:quality-probe');
    expect(ps1).not.toContain('IO.socket(');
    expect(universal).not.toContain('IO.socket(');
  });

  it("keeps bounded adaptive delay and frame/state relay semantics", () => {
    const quality = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/NetplayQualityMonitor.kt");
    const worker = read("cloudflare-netplay/src/index.ts");
    expect(quality).toContain("MAX_INPUT_DELAY_FRAMES");
    expect(quality).toContain("frames.coerceIn(2L, MAX_INPUT_DELAY_FRAMES)");
    expect(worker).toContain('inputDelay:3');
    expect(worker).toContain('netplay:session-start');
  });

  it("uses built-in WebRTC voice signaling without requiring LiveKit credentials", () => {
    const worker = read("cloudflare-netplay/src/index.ts");
    const voice = read("components/room-voice-chat-reliable.native.tsx");
    expect(worker).toContain('voice:signal');
    expect(worker).toContain('netplay:voice-status');
    expect(voice).toContain("RTCPeerConnection");
    expect(voice).toContain("mediaDevices.getUserMedia");
    expect(voice).toContain("voice:signal");
    expect(voice).toContain("netplay:voice-status");
    expect(voice).not.toContain("LiveKitRoom");
  });
});
