import { describe, expect, it } from "vitest";
import { NetplaySessionEngine } from "./netplay-session-engine";

describe("NetplaySessionEngine", () => {
  it("creates stable seats and rejects duplicate active sessions", () => {
    const engine = new NetplaySessionEngine();
    const first = engine.start({ roomId: 7, system: "ps1", hostMemberId: 10, playerMemberIds: [10, 20], now: 1000 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.session.sessionId).toBeTruthy();
    expect(first.session.state).toBe("WAITING");
    expect(engine.transition(7, "READY_CHECK", 1500)).toBe(true);
    expect(engine.get(7)?.state).toBe("READY_CHECK");
    expect(first.session.seats.get(10)).toBe(1);
    expect(first.session.seats.get(20)).toBe(2);

    const duplicate = engine.start({ roomId: 7, system: "ps1", hostMemberId: 10, playerMemberIds: [10, 20], now: 1100 });
    expect(duplicate).toEqual({ ok: false, reason: "already-active" });
  });

  it("enforces READY_CHECK -> SYNCING -> RUNNING and reconnect grace", () => {
    const engine = new NetplaySessionEngine({ reconnectGraceMs: 30_000 });
    const started = engine.start({ roomId: 8, system: "n64", hostMemberId: 1, playerMemberIds: [1, 2], now: 1000 });
    expect(started.ok).toBe(true);
    expect(engine.transition(8, "READY_CHECK", 1500)).toBe(true);
    expect(engine.beginSync(8, 2000)).toBe(true);
    expect(engine.markRunning(8, 3000)).toBe(true);
    expect(engine.markDisconnected(8, 2, 4000)).toBe(true);
    expect(engine.get(8)?.state).toBe("RECONNECTING");
    expect(engine.reconnect(8, 2, 20_000)).toBe(true);
    expect(engine.get(8)?.state).toBe("RUNNING");
    expect(engine.markDisconnected(8, 2, 30_000)).toBe(true);
    const expired = engine.sweep(60_000);
    expect(expired).toHaveLength(1);
    expect(engine.get(8)?.state).toBe("ENDED");
  });

  it("migrates host authority to the next stable player without changing seats", () => {
    const engine = new NetplaySessionEngine();
    const started = engine.start({ roomId: 10, system: "ps1", hostMemberId: 1, playerMemberIds: [1, 2, 3], now: 1000 });
    expect(started.ok).toBe(true);
    expect(engine.transition(10, "READY_CHECK", 1100)).toBe(true);
    expect(engine.beginSync(10, 1200)).toBe(true);
    expect(engine.markRunning(10, 1300)).toBe(true);
    expect(engine.migrateHost(10, 1, 1400)).toEqual({ ok: true, hostMemberId: 2 });
    expect(engine.get(10)?.hostMemberId).toBe(2);
    expect(engine.get(10)?.seats.get(1)).toBe(1);
    expect(engine.get(10)?.seats.get(2)).toBe(2);
  });

  it("supports reconnect at 2s and 10s, and expires just after the 30s grace window", () => {
    for (const reconnectAt of [2_000, 10_000, 30_000]) {
      const engine = new NetplaySessionEngine({ reconnectGraceMs: 30_000 });
      const started = engine.start({ roomId: reconnectAt, system: "ps1", hostMemberId: 1, playerMemberIds: [1, 2], now: 1_000 });
      expect(started.ok).toBe(true);
      engine.transition(reconnectAt, "READY_CHECK", 1_100);
      engine.beginSync(reconnectAt, 1_200);
      engine.markRunning(reconnectAt, 1_300);
      expect(engine.markDisconnected(reconnectAt, 2, 2_000)).toBe(true);
      expect(engine.reconnect(reconnectAt, 2, 2_000 + reconnectAt - 2_000)).toBe(true);
    }
    const expired = new NetplaySessionEngine({ reconnectGraceMs: 30_000 });
    expired.start({ roomId: 99, system: "ps2", hostMemberId: 1, playerMemberIds: [1, 2], now: 1_000 });
    expired.transition(99, "READY_CHECK", 1_100);
    expired.beginSync(99, 1_200);
    expired.markRunning(99, 1_300);
    expect(expired.markDisconnected(99, 2, 2_000)).toBe(true);
    expect(expired.sweep(32_001)).toHaveLength(1);
    expect(expired.reconnect(99, 2, 32_001)).toBe(false);
  });

  it("does not allow an unrelated member to reclaim a seat", () => {
    const engine = new NetplaySessionEngine();
    engine.start({ roomId: 9, system: "ps2", hostMemberId: 1, playerMemberIds: [1, 2] });
    expect(engine.reconnect(9, 99)).toBe(false);
    expect(engine.markDisconnected(9, 99)).toBe(false);
  });
});
