import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("room voice signalling protocol", () => {
  it("uses one event name across the native client and both relay implementations", () => {
    const client = read("components/room-voice-chat-reliable.native.tsx");
    const cloudflare = read("cloudflare-netplay/src/index.ts");
    const socketIo = read("server/netplay.ts");
    expect(client).toContain('send("voice:signal"');
    expect(client).toContain('socket?.on?.("voice:signal"');
    expect(cloudflare).toContain('msg?.event==="voice:signal"');
    expect(socketIo).toContain('socket.on("voice:signal"');
    expect(socketIo).toContain('peerSocket?.emit("voice:signal"');
  });

  it("has peer recovery for failed ICE connections", () => {
    const client = read("components/room-voice-chat-reliable.native.tsx");
    expect(client).toContain('state==="failed"');
    expect(client).toContain("Reconcile peers from the room member list too");
  });
});
