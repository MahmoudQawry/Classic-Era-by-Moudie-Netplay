/** Unified realtime room lifecycle manager.
 *
 * Root-cause fix for the reported symptoms (slowness when a session starts,
 * repeated dropouts and permanent sync loss): every relay used to keep its
 * per-room state (authoritative snapshots of up to ~4.5 MB, acknowledgement
 * sets, frame trackers, input histories, rate-limit windows, delay values)
 * in module-level maps that were NEVER released. A single server process
 * accumulated them for every room ever created, so heap pressure, GC pauses
 * and serialization costs grew until sockets started timing out.
 *
 * This registry is the single authority for room lifetime:
 *  - every room has one lifecycle record (sockets + activity + tracked state)
 *  - sockets attach/detach explicitly, so emptiness is exact
 *  - a periodic sweep destroys idle/empty rooms and runs per-room disposers
 *  - snapshots are additionally bounded by a TTL and a global byte budget
 *
 * The sweep is intentionally cheap: it walks a small Map and only touches
 * per-room records, so it can run every few seconds without contributing to
 * the load it is meant to relieve.
 */

export type RoomDisposer = () => void;

export type RoomLifecycle = {
  roomId: number;
  createdAt: number;
  lastActivity: number;
  sockets: Set<string>;
  disposers: Set<RoomDisposer>;
  snapshots: Map<string, { bytes: number; updatedAt: number }>;
};

export type SweepOptions = {
  /** Max time a room with zero sockets is kept before destruction. */
  emptyRoomTtlMs?: number;
  /** Max age of an authoritative snapshot before it is dropped. */
  snapshotTtlMs?: number;
  /** Global ceiling for all cached snapshot bytes across rooms. */
  snapshotBudgetBytes?: number;
  /** Sweep cadence. */
  intervalMs?: number;
};

export type SweepReport = {
  destroyedRooms: number;
  droppedSnapshots: number;
  evictedForBudget: number;
  liveRooms: number;
  liveSockets: number;
  snapshotBytes: number;
};

const DEFAULTS = {
  emptyRoomTtlMs: 90_000,
  snapshotTtlMs: 120_000,
  snapshotBudgetBytes: 48 * 1024 * 1024,
  intervalMs: 15_000,
} satisfies Required<SweepOptions>;

export class RoomLifecycleRegistry {
  private rooms = new Map<number, RoomLifecycle>();
  private snapshotDisposers = new Map<string, RoomDisposer>();
  private readonly options: Required<SweepOptions>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastReport: SweepReport = { destroyedRooms: 0, droppedSnapshots: 0, evictedForBudget: 0, liveRooms: 0, liveSockets: 0, snapshotBytes: 0 };
  private onSweep?: (report: SweepReport) => void;

  constructor(options: SweepOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  /** Returns (creating if needed) the lifecycle record for a room and marks it active. */
  touch(roomId: number): RoomLifecycle {
    const now = Date.now();
    let lifecycle = this.rooms.get(roomId);
    if (!lifecycle) {
      lifecycle = { roomId, createdAt: now, lastActivity: now, sockets: new Set(), disposers: new Set(), snapshots: new Map() };
      this.rooms.set(roomId, lifecycle);
    }
    lifecycle.lastActivity = now;
    return lifecycle;
  }

  peek(roomId: number): RoomLifecycle | undefined {
    return this.rooms.get(roomId);
  }

  attachSocket(roomId: number, socketId: string) {
    this.touch(roomId).sockets.add(socketId);
  }

  /** Removes a socket; returns the number of sockets still attached to the room. */
  detachSocket(roomId: number, socketId: string): number {
    const lifecycle = this.rooms.get(roomId);
    if (!lifecycle) return 0;
    lifecycle.sockets.delete(socketId);
    lifecycle.lastActivity = Date.now();
    return lifecycle.sockets.size;
  }

  socketCount(roomId: number): number {
    return this.rooms.get(roomId)?.sockets.size ?? 0;
  }

  /** Registers a cleanup callback executed exactly once when the room is destroyed. */
  onDestroy(roomId: number, disposer: RoomDisposer) {
    this.touch(roomId).disposers.add(disposer);
  }

  /** Records the size and freshness of an authoritative snapshot for budget/ttl accounting. */
  noteSnapshot(roomId: number, key: string, bytes: number) {
    const lifecycle = this.touch(roomId);
    lifecycle.snapshots.set(key, { bytes: Math.max(0, bytes), updatedAt: Date.now() });
  }

  /** Registers the payload disposer for one snapshot key so that TTL and budget
   * eviction release the actual multi-megabyte buffer, not just its accounting. */
  registerSnapshotDisposer(roomId: number, key: string, disposer: RoomDisposer) {
    this.touch(roomId);
    this.snapshotDisposers.set(`${roomId}::${key}`, disposer);
  }

  private runSnapshotDisposer(roomId: number, key: string) {
    const mapKey = `${roomId}::${key}`;
    const disposer = this.snapshotDisposers.get(mapKey);
    this.snapshotDisposers.delete(mapKey);
    if (!disposer) return;
    try {
      disposer();
    } catch (error) {
      console.warn(`[room-lifecycle] snapshot disposer failed for ${roomId}:${key}:`, error);
    }
  }

  dropSnapshotNote(roomId: number, key: string) {
    this.rooms.get(roomId)?.snapshots.delete(key);
    this.snapshotDisposers.delete(`${roomId}::${key}`);
  }

  snapshotBytes(): number {
    let total = 0;
    for (const lifecycle of this.rooms.values()) for (const entry of lifecycle.snapshots.values()) total += entry.bytes;
    return total;
  }

  /** Destroys a room immediately: runs disposers, clears state, forgets the room. */
  destroy(roomId: number, reason = "idle"): boolean {
    const lifecycle = this.rooms.get(roomId);
    if (!lifecycle) return false;
    for (const key of [...lifecycle.snapshots.keys()]) this.runSnapshotDisposer(roomId, key);
    for (const disposer of lifecycle.disposers) {
      try {
        disposer();
      } catch (error) {
        console.warn(`[room-lifecycle] disposer failed for room ${roomId}:`, error);
      }
    }
    lifecycle.disposers.clear();
    lifecycle.snapshots.clear();
    this.rooms.delete(roomId);
    void reason;
    return true;
  }

  /** Runs one cleanup pass. Safe to call directly from tests. */
  sweep(now = Date.now()): SweepReport {
    let destroyedRooms = 0;
    let droppedSnapshots = 0;

    for (const lifecycle of [...this.rooms.values()]) {
      const emptyFor = now - lifecycle.lastActivity;
      if (lifecycle.sockets.size === 0 && emptyFor >= this.options.emptyRoomTtlMs) {
        if (this.destroy(lifecycle.roomId, "empty")) destroyedRooms += 1;
        continue;
      }
      for (const [key, entry] of [...lifecycle.snapshots]) {
        if (now - entry.updatedAt > this.options.snapshotTtlMs) {
          lifecycle.snapshots.delete(key);
          this.runSnapshotDisposer(lifecycle.roomId, key);
          droppedSnapshots += 1;
        }
      }
    }

    // Global byte budget: evict oldest snapshot notes first (their payloads are
    // released by the relay through the disposer it registers per snapshot key).
    let evictedForBudget = 0;
    let liveBytes = this.snapshotBytes();
    if (liveBytes > this.options.snapshotBudgetBytes) {
      const candidates: { roomId: number; key: string; updatedAt: number; bytes: number }[] = [];
      for (const lifecycle of this.rooms.values()) {
        for (const [key, entry] of lifecycle.snapshots) candidates.push({ roomId: lifecycle.roomId, key, updatedAt: entry.updatedAt, bytes: entry.bytes });
      }
      candidates.sort((left, right) => left.updatedAt - right.updatedAt);
      for (const candidate of candidates) {
        if (liveBytes <= this.options.snapshotBudgetBytes) break;
        this.rooms.get(candidate.roomId)?.snapshots.delete(candidate.key);
        this.runSnapshotDisposer(candidate.roomId, candidate.key);
        liveBytes -= candidate.bytes;
        evictedForBudget += 1;
      }
    }

    let liveSockets = 0;
    for (const lifecycle of this.rooms.values()) liveSockets += lifecycle.sockets.size;
    this.lastReport = { destroyedRooms, droppedSnapshots, evictedForBudget, liveRooms: this.rooms.size, liveSockets, snapshotBytes: Math.max(0, liveBytes) };
    this.onSweep?.(this.lastReport);
    return this.lastReport;
  }

  /** Starts the automatic sweep. Unref'd so it never keeps a process alive. */
  start(options: { onSweep?: (report: SweepReport) => void; intervalMs?: number } = {}) {
    if (this.timer) return;
    this.onSweep = options.onSweep;
    const intervalMs = options.intervalMs ?? this.options.intervalMs;
    this.timer = setInterval(() => this.sweep(), intervalMs);
    (this.timer as unknown as { unref?: () => void }).unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  stats() {
    return { ...this.lastReport, rooms: this.rooms.size, snapshotBytes: this.snapshotBytes() };
  }
}

/** Small sliding-window limiter used for chat, signalling and voice-status. */
export class SlidingWindowLimiter {
  private windows = new Map<string, { count: number; windowStart: number }>();
  constructor(private readonly limit: number, private readonly windowMs: number) {}

  allow(key: string, now = Date.now()): boolean {
    const record = this.windows.get(key);
    if (!record || now - record.windowStart >= this.windowMs) {
      this.windows.set(key, { count: 1, windowStart: now });
      return true;
    }
    if (record.count >= this.limit) return false;
    record.count += 1;
    return true;
  }

  /** Drops windows that have fully expired; call from the sweep to bound memory. */
  prune(now = Date.now()): number {
    let removed = 0;
    for (const [key, record] of this.windows) {
      if (now - record.windowStart >= this.windowMs * 2) {
        this.windows.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  size(): number {
    return this.windows.size;
  }

  clear() {
    this.windows.clear();
  }
}
