import { describe, expect, it, vi } from "vitest";
import { RoomLifecycleRegistry, SlidingWindowLimiter } from "../server/room-lifecycle";

describe("RoomLifecycleRegistry", () => {
  it("creates a room on first touch and counts attached sockets", () => {
    const registry = new RoomLifecycleRegistry();
    registry.attachSocket(1, "s1");
    registry.attachSocket(1, "s2");
    expect(registry.socketCount(1)).toBe(2);
    expect(registry.detachSocket(1, "s1")).toBe(1);
    expect(registry.detachSocket(1, "missing")).toBe(1);
  });

  it("runs the disposer exactly once and forgets the room on destroy", () => {
    const registry = new RoomLifecycleRegistry();
    const disposer = vi.fn();
    registry.onDestroy(7, disposer);
    expect(registry.destroy(7)).toBe(true);
    expect(disposer).toHaveBeenCalledTimes(1);
    expect(registry.peek(7)).toBeUndefined();
    expect(registry.destroy(7)).toBe(false);
    expect(disposer).toHaveBeenCalledTimes(1);
  });

  it("destroys only rooms that have been empty past the TTL", () => {
    const registry = new RoomLifecycleRegistry({ emptyRoomTtlMs: 1_000 });
    const emptyDisposer = vi.fn();
    const busyDisposer = vi.fn();
    registry.onDestroy(1, emptyDisposer);
    registry.attachSocket(1, "s1");
    registry.detachSocket(1, "s1"); // room 1 is now empty
    registry.onDestroy(2, busyDisposer);
    registry.attachSocket(2, "s2"); // room 2 stays busy

    const start = Date.now();
    registry.sweep(start); // nothing expired yet
    expect(emptyDisposer).not.toHaveBeenCalled();

    registry.sweep(start + 1_500);
    expect(emptyDisposer).toHaveBeenCalledTimes(1);
    expect(busyDisposer).not.toHaveBeenCalled();
    expect(registry.socketCount(2)).toBe(1);
  });

  it("drops expired snapshot notes and keeps fresh ones", () => {
    const registry = new RoomLifecycleRegistry({ snapshotTtlMs: 5_000 });
    registry.attachSocket(3, "s3");
    registry.noteSnapshot(3, "ps1", 1_000);
    const start = Date.now();
    registry.sweep(start);
    expect(registry.peek(3)?.snapshots.has("ps1")).toBe(true);
    registry.sweep(start + 6_000);
    expect(registry.peek(3)?.snapshots.has("ps1")).toBe(false);
  });

  it("evicts the oldest snapshots when the global budget is exceeded", () => {
    const registry = new RoomLifecycleRegistry({ snapshotBudgetBytes: 1_500, snapshotTtlMs: 600_000 });
    registry.attachSocket(1, "s1");
    registry.attachSocket(2, "s2");
    registry.noteSnapshot(1, "ps1", 1_000);
    const first = Date.now();
    // Force a newer timestamp on the second note so eviction order is deterministic.
    vi.spyOn(Date, "now").mockReturnValue(first + 1_000);
    registry.noteSnapshot(2, "nes", 1_000);
    vi.restoreAllMocks();
    const report = registry.sweep(first + 2_000);
    expect(report.evictedForBudget).toBe(1);
    expect(registry.snapshotBytes()).toBeLessThanOrEqual(1_500);
    expect(registry.peek(1)?.snapshots.size).toBe(0);
    expect(registry.peek(2)?.snapshots.size).toBe(1);
  });

  it("releases snapshot payloads through their disposers on TTL and budget eviction", () => {
    const registry = new RoomLifecycleRegistry({ snapshotBudgetBytes: 1_500, snapshotTtlMs: 5_000 });
    registry.attachSocket(9, "s9");
    const payloads = new Map<string, string>();
    payloads.set("ps1", "x".repeat(1_000));
    registry.registerSnapshotDisposer(9, "ps1", () => payloads.delete("ps1"));
    registry.noteSnapshot(9, "ps1", 1_000);
    payloads.set("nes", "y".repeat(1_000));
    registry.registerSnapshotDisposer(9, "nes", () => payloads.delete("nes"));
    registry.noteSnapshot(9, "nes", 1_000);

    const start = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(start + 10);
    registry.sweep(start + 10); // budget eviction removes the oldest payload
    vi.restoreAllMocks();
    expect(payloads.size).toBe(1);

    registry.sweep(start + 20_000); // TTL eviction removes the rest
    expect(payloads.size).toBe(0);
  });

  it("reports live rooms, sockets and snapshot bytes", () => {
    const registry = new RoomLifecycleRegistry();
    registry.attachSocket(4, "s4");
    registry.noteSnapshot(4, "u:4:psp", 500);
    const report = registry.sweep();
    expect(report.liveRooms).toBe(1);
    expect(report.liveSockets).toBe(1);
    expect(report.snapshotBytes).toBe(500);
  });
});

describe("SlidingWindowLimiter", () => {
  it("allows up to the limit per window and blocks the rest", () => {
    const limiter = new SlidingWindowLimiter(3, 1_000);
    const start = 10_000;
    expect(limiter.allow("a", start)).toBe(true);
    expect(limiter.allow("a", start + 10)).toBe(true);
    expect(limiter.allow("a", start + 20)).toBe(true);
    expect(limiter.allow("a", start + 30)).toBe(false);
    // A new window resets the counter.
    expect(limiter.allow("a", start + 1_100)).toBe(true);
    // Keys are isolated.
    expect(limiter.allow("b", start + 30)).toBe(true);
  });

  it("prunes fully expired windows to bound memory", () => {
    const limiter = new SlidingWindowLimiter(5, 1_000);
    limiter.allow("room:1:member", 0);
    limiter.allow("room:1:member2", 500);
    expect(limiter.size()).toBe(2);
    const removed = limiter.prune(2_500);
    expect(removed).toBe(2);
    expect(limiter.size()).toBe(0);
  });
});
