import { randomUUID } from "crypto";

export type NetplaySessionState =
  | "WAITING"
  | "READY_CHECK"
  | "SYNCING"
  | "RUNNING"
  | "RECONNECTING"
  | "ENDED"
  | "CLOSED";

export type NetplaySession = {
  sessionId: string;
  roomId: number;
  system: string;
  hostMemberId: number;
  playerMemberIds: number[];
  seats: Map<number, number>;
  state: NetplaySessionState;
  createdAt: number;
  updatedAt: number;
  reconnectDeadline: number | null;
};

export type SessionStartResult =
  | { ok: true; session: NetplaySession }
  | { ok: false; reason: "already-active" };

export class NetplaySessionEngine {
  private readonly sessions = new Map<number, NetplaySession>();
  private readonly reconnectGraceMs: number;

  constructor(options: { reconnectGraceMs?: number } = {}) {
    this.reconnectGraceMs = Math.max(1_000, options.reconnectGraceMs ?? 30_000);
  }

  get(roomId: number): NetplaySession | undefined {
    return this.sessions.get(roomId);
  }

  start(input: {
    roomId: number;
    system: string;
    hostMemberId: number;
    playerMemberIds: number[];
    now?: number;
  }): SessionStartResult {
    const current = this.sessions.get(input.roomId);
    if (current && current.state !== "ENDED" && current.state !== "CLOSED") {
      return { ok: false, reason: "already-active" };
    }

    const now = input.now ?? Date.now();
    const uniquePlayers = Array.from(new Set(input.playerMemberIds));
    const seats = new Map<number, number>();
    uniquePlayers.forEach((memberId, index) => seats.set(memberId, index + 1));

    const session: NetplaySession = {
      sessionId: randomUUID(),
      roomId: input.roomId,
      system: input.system,
      hostMemberId: input.hostMemberId,
      playerMemberIds: uniquePlayers,
      seats,
      state: "READY_CHECK",
      createdAt: now,
      updatedAt: now,
      reconnectDeadline: null,
    };
    this.sessions.set(input.roomId, session);
    return { ok: true, session };
  }

  transition(roomId: number, next: Exclude<NetplaySessionState, "WAITING">, now = Date.now()): boolean {
    const session = this.sessions.get(roomId);
    if (!session) return false;

    const allowed: Record<NetplaySessionState, NetplaySessionState[]> = {
      WAITING: ["READY_CHECK", "CLOSED"],
      READY_CHECK: ["SYNCING", "ENDED", "CLOSED"],
      SYNCING: ["RUNNING", "RECONNECTING", "ENDED", "CLOSED"],
      RUNNING: ["RECONNECTING", "ENDED", "CLOSED"],
      RECONNECTING: ["RUNNING", "ENDED", "CLOSED"],
      ENDED: ["CLOSED"],
      CLOSED: [],
    };
    if (!allowed[session.state].includes(next)) return false;
    session.state = next;
    session.updatedAt = now;
    if (next !== "RECONNECTING") session.reconnectDeadline = null;
    return true;
  }

  beginSync(roomId: number, now = Date.now()): boolean {
    return this.transition(roomId, "SYNCING", now);
  }

  markRunning(roomId: number, now = Date.now()): boolean {
    return this.transition(roomId, "RUNNING", now);
  }

  markDisconnected(roomId: number, memberId: number, now = Date.now()): boolean {
    const session = this.sessions.get(roomId);
    if (!session || !session.playerMemberIds.includes(memberId)) return false;
    if (session.state !== "RUNNING" && session.state !== "SYNCING") return false;
    session.state = "RECONNECTING";
    session.updatedAt = now;
    session.reconnectDeadline = now + this.reconnectGraceMs;
    return true;
  }

  reconnect(roomId: number, memberId: number, now = Date.now()): boolean {
    const session = this.sessions.get(roomId);
    if (!session || !session.playerMemberIds.includes(memberId)) return false;
    if (session.state !== "RECONNECTING" || !session.reconnectDeadline || now > session.reconnectDeadline) return false;
    session.state = "RUNNING";
    session.updatedAt = now;
    session.reconnectDeadline = null;
    return true;
  }

  end(roomId: number, now = Date.now()): boolean {
    const session = this.sessions.get(roomId);
    if (!session || session.state === "ENDED" || session.state === "CLOSED") return false;
    session.state = "ENDED";
    session.updatedAt = now;
    session.reconnectDeadline = null;
    return true;
  }

  close(roomId: number, now = Date.now()): boolean {
    const session = this.sessions.get(roomId);
    if (!session || session.state === "CLOSED") return false;
    session.state = "CLOSED";
    session.updatedAt = now;
    session.reconnectDeadline = null;
    return true;
  }

  sweep(now = Date.now()): NetplaySession[] {
    const expired: NetplaySession[] = [];
    for (const session of this.sessions.values()) {
      if (session.state === "RECONNECTING" && session.reconnectDeadline !== null && now >= session.reconnectDeadline) {
        session.state = "ENDED";
        session.updatedAt = now;
        session.reconnectDeadline = null;
        expired.push(session);
      }
    }
    return expired;
  }

  destroy(roomId: number): boolean {
    return this.sessions.delete(roomId);
  }

  clear(): void {
    this.sessions.clear();
  }
}
