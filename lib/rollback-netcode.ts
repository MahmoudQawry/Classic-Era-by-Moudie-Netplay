/**
 * Frame-based rollback primitives shared by NetPlay orchestration.
 *
 * This module does not guess or serialize emulator internals. The native core
 * supplies save/load/step callbacks. The buffer keeps the last deterministic
 * checkpoints and predicted remote inputs so a native emulator can re-simulate
 * only the divergent window.
 */
export type FrameNumber = number;

export type RollbackInput<TInput> = {
  frame: FrameNumber;
  input: TInput;
  predicted?: boolean;
};

export type RollbackCheckpoint<TState> = {
  frame: FrameNumber;
  state: TState;
};

export type RollbackStats = {
  rollbacks: number;
  correctedFrames: number;
  predictions: number;
  maxRollbackDepth: number;
};

export class RollbackBuffer<TState, TInput> {
  private readonly checkpoints = new Map<FrameNumber, RollbackCheckpoint<TState>>();
  private readonly inputs = new Map<FrameNumber, RollbackInput<TInput>>();
  private statsValue: RollbackStats = { rollbacks: 0, correctedFrames: 0, predictions: 0, maxRollbackDepth: 0 };

  constructor(private readonly maxFrames = 120) {
    if (!Number.isInteger(maxFrames) || maxFrames < 2) throw new Error("maxFrames must be >= 2");
  }

  saveCheckpoint(frame: number, state: TState) {
    this.checkpoints.set(this.normalizeFrame(frame), { frame: this.normalizeFrame(frame), state });
    this.prune(frame);
  }

  predict(frame: number, input: TInput) {
    const normalized = this.normalizeFrame(frame);
    if (!this.inputs.has(normalized)) {
      this.inputs.set(normalized, { frame: normalized, input, predicted: true });
      this.statsValue.predictions += 1;
    }
    return this.inputs.get(normalized)!;
  }

  receiveRemoteInput(frame: number, input: TInput): { corrected: boolean; rollbackFrom: number | null } {
    const normalized = this.normalizeFrame(frame);
    const previous = this.inputs.get(normalized);
    const corrected = Boolean(previous?.predicted) && !this.sameInput(previous.input, input);
    this.inputs.set(normalized, { frame: normalized, input, predicted: false });

    if (!corrected) return { corrected: false, rollbackFrom: null };

    const checkpoint = this.latestCheckpointAtOrBefore(normalized);
    const rollbackFrom = checkpoint?.frame ?? null;
    const depth = rollbackFrom === null ? 0 : Math.max(0, this.latestFrame() - rollbackFrom);
    this.statsValue.rollbacks += 1;
    this.statsValue.correctedFrames += depth + 1;
    this.statsValue.maxRollbackDepth = Math.max(this.statsValue.maxRollbackDepth, depth);
    return { corrected: true, rollbackFrom };
  }

  getInput(frame: number): RollbackInput<TInput> | undefined {
    return this.inputs.get(this.normalizeFrame(frame));
  }

  getCheckpoint(frame: number): RollbackCheckpoint<TState> | undefined {
    return this.checkpoints.get(this.normalizeFrame(frame));
  }

  latestCheckpointAtOrBefore(frame: number) {
    const target = this.normalizeFrame(frame);
    let best: RollbackCheckpoint<TState> | undefined;
    for (const checkpoint of this.checkpoints.values()) {
      if (checkpoint.frame <= target && (!best || checkpoint.frame > best.frame)) best = checkpoint;
    }
    return best;
  }

  latestFrame() {
    let latest = 0;
    for (const frame of this.inputs.keys()) latest = Math.max(latest, frame);
    for (const frame of this.checkpoints.keys()) latest = Math.max(latest, frame);
    return latest;
  }

  stats(): RollbackStats {
    return { ...this.statsValue };
  }

  clear() {
    this.checkpoints.clear();
    this.inputs.clear();
    this.statsValue = { rollbacks: 0, correctedFrames: 0, predictions: 0, maxRollbackDepth: 0 };
  }

  private prune(frame: number) {
    const minimum = this.normalizeFrame(frame) - this.maxFrames;
    for (const key of this.checkpoints.keys()) if (key < minimum) this.checkpoints.delete(key);
    for (const key of this.inputs.keys()) if (key < minimum) this.inputs.delete(key);
  }

  private normalizeFrame(frame: number) {
    if (!Number.isSafeInteger(frame) || frame < 0) throw new Error("frame must be a non-negative safe integer");
    return frame;
  }

  private sameInput(left: TInput, right: TInput) {
    if (Object.is(left, right)) return true;
    try { return JSON.stringify(left) === JSON.stringify(right); } catch { return false; }
  }
}

/** Small, deterministic frame scheduler used by the realtime layer. */
export function targetFrame(nowMs: number, startMs: number, fps = 60): number {
  if (!Number.isFinite(nowMs) || !Number.isFinite(startMs) || !Number.isFinite(fps) || fps <= 0) return 0;
  return Math.max(0, Math.floor((nowMs - startMs) * fps / 1000));
}

export function shouldRollback(predicted: unknown, actual: unknown) {
  if (Object.is(predicted, actual)) return false;
  try { return JSON.stringify(predicted) !== JSON.stringify(actual); } catch { return true; }
}
