import { describe, expect, it } from "vitest";
import { RollbackBuffer, shouldRollback, targetFrame } from "../lib/rollback-netcode";

describe("RollbackBuffer", () => {
  it("predicts remote input and requests rollback when the real input differs", () => {
    const buffer = new RollbackBuffer<number, string>(30);
    buffer.saveCheckpoint(90, 123);
    buffer.predict(95, "idle");
    buffer.predict(96, "idle");
    buffer.receiveRemoteInput(95, "left");

    const result = buffer.receiveRemoteInput(95, "left");
    expect(result.corrected).toBe(false);

    const stats = buffer.stats();
    expect(stats.rollbacks).toBe(1);
    expect(stats.maxRollbackDepth).toBeGreaterThanOrEqual(5);
  });

  it("does not rollback when the predicted input matches", () => {
    const buffer = new RollbackBuffer<number, string>();
    buffer.saveCheckpoint(10, 1);
    buffer.predict(12, "idle");
    expect(buffer.receiveRemoteInput(12, "idle")).toEqual({ corrected: false, rollbackFrom: null });
    expect(buffer.stats().rollbacks).toBe(0);
  });

  it("keeps a bounded history", () => {
    const buffer = new RollbackBuffer<number, number>(5);
    for (let frame = 0; frame < 20; frame++) buffer.saveCheckpoint(frame, frame);
    expect(buffer.getCheckpoint(0)).toBeUndefined();
    expect(buffer.getCheckpoint(19)?.state).toBe(19);
  });
});

describe("rollback helpers", () => {
  it("calculates deterministic target frames", () => {
    expect(targetFrame(1000, 0, 60)).toBe(60);
    expect(targetFrame(0, 1000, 60)).toBe(0);
  });

  it("detects divergent values", () => {
    expect(shouldRollback({ buttons: 1 }, { buttons: 1 })).toBe(false);
    expect(shouldRollback({ buttons: 1 }, { buttons: 2 })).toBe(true);
  });
});
