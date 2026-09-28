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
    expect(ps1).toContain('CloudflareNetplayWebSocket');
    expect(universal).toContain('CloudflareNetplayWebSocket');
    expect(ps1).toContain('transport?.send("netplay:ps1-input"');
    expect(universal).toContain('transport?.send("netplay:universal-input"');
    expect(transport).toContain('/ws/room/');
    expect(transport).toContain('netplay:quality-probe');
    expect(ps1).not.toContain('IO.socket(');
    expect(universal).not.toContain('IO.socket(');
  });

  it("keeps the Socket.IO fallback aligned with native universal-player sessions", () => {
    const server = read("server/netplay.ts");
    const transport = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/CloudflareNetplayWebSocket.kt");
    expect(server).toContain('session.clientKind !== "universal-player"');
    expect(server).toContain('payload?.system === "n64" || payload?.system === "ps2"');
    expect(server).toContain('socket.on("netplay:universal-input"');
    expect(transport).toContain("scheduleReconnect()");
    expect(transport).toContain("coerceAtMost(10_000L)");
  });

  it("keeps bounded adaptive delay and frame/state relay semantics", () => {
    const quality = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/NetplayQualityMonitor.kt");
    const worker = read("cloudflare-netplay/src/index.ts");
    expect(quality).toContain("MAX_INPUT_DELAY_FRAMES");
    expect(quality).toContain("frames.coerceIn(2L, MAX_INPUT_DELAY_FRAMES)");
    expect(worker).toContain("const payload={system:requested.system,startAt,playerMemberIds,inputDelay}");
    expect(worker).toContain("clampInputDelay");
    expect(worker).toContain('netplay:session-start');
  });

  it("uses LiveKit SFU as the production voice transport", () => {
    const voice = read("components/room-voice-chat-reliable.native.tsx");
    const server = read("server/livekit.ts");
    const app = read("android/app/src/main/java/com/app/moudienetplay/MainApplication.kt");
    expect(voice).toContain("LiveKitRoom");
    expect(voice).toContain("AudioSession.startAudioSession");
    expect(voice).toContain("setMicrophoneEnabled");
    expect(voice).toContain("selectAudioOutput");
    expect(server).toContain("new AccessToken");
    expect(server).toContain("roomJoin: true");
    expect(app).toContain("LiveKitReactNative.setup");
  });
});
