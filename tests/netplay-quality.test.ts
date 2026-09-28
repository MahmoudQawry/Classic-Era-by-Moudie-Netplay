import { describe, expect, it, vi } from "vitest";

import { formatNetplayQuality, startNetplayQualityMonitor } from "../lib/netplay-quality";

class SocketStub {
  connected = true;
  emitted: Array<{ event: string; payload: unknown }> = [];
  private listeners = new Map<string, (payload: any) => void>();
  emit(event: string, payload: unknown) { this.emitted.push({ event, payload }); return this; }
  on(event: string, listener: (payload: any) => void) { this.listeners.set(event, listener); return this; }
  off(event: string) { this.listeners.delete(event); return this; }
  receive(event: string, payload: unknown) { this.listeners.get(event)?.(payload); }
}

describe("NetPlay quality monitor", () => {
  it("publishes measured RTT and a stable grade after a real probe response", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const socket = new SocketStub();
    const updates: ReturnType<typeof vi.fn> = vi.fn();
    const stop = startNetplayQualityMonitor(socket as never, updates);
    const initialProbe = socket.emitted.find((entry) => entry.event === "netplay:quality-probe")?.payload as { sequence: number };
    vi.advanceTimersByTime(42);
    socket.receive("netplay:quality-pong", { sequence: initialProbe.sequence });
    expect(updates.mock.lastCall?.[0]).toMatchObject({ rttMs: 42, grade: "STABLE" });
    // The window is sized from the measured path (42 ms RTT + safety headroom at
    // 60 FPS) instead of a fixed bucket, and it must stay inside 2..45.
    const request = socket.emitted.find((entry) => entry.event === "netplay:delay-request")?.payload as { delay: number; reason: string };
    expect(request.delay).toBeGreaterThanOrEqual(2);
    expect(request.delay).toBeLessThanOrEqual(45);
    expect(request.reason).toBe("network-adaptation");
    stop();
    vi.useRealTimers();
  });

  it("does not invent a ping before receiving a server response", () => {
    expect(formatNetplayQuality({ rttMs: null, jitterMs: null, probeLossPercent: null, grade: "CONNECTING" })).toBe("PING — · CONNECTING");
  });
});
