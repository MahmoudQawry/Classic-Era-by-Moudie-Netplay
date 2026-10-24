export type ReadySessionPeer = {
  memberId: number;
  role: "host" | "player";
  fingerprint: string;
  coreVersion: string;
};

export type SessionBarrier = {
  fingerprint: string;
  coreVersion: string;
  hostMemberId: number;
  playerMemberIds: number[];
  startAt: number;
};

export function createSessionBarrier(peers: ReadySessionPeer[], now: number, leadTimeMs = 3000): SessionBarrier | null {
  const host = peers.find((peer) => peer.role === "host");
  if (!host || peers.length < 2 || peers.length > 4) return null;
  if (peers.some((peer) => peer.fingerprint !== host.fingerprint || peer.coreVersion !== host.coreVersion)) return null;
  return {
    fingerprint: host.fingerprint,
    coreVersion: host.coreVersion,
    hostMemberId: host.memberId,
    playerMemberIds: peers.map((peer) => peer.memberId),
    startAt: now + leadTimeMs,
  };
}

export type RomLoadedSignal = {
  memberId: number;
  roomId: number;
  fingerprint: string;
  system: string;
  coreVersion?: string;
};

export function canSynchronousGameStart(
  loadedMembers: Set<number>,
  requiredMemberIds: number[],
  fingerprints: Map<number, string>
): boolean {
  if (requiredMemberIds.length < 2) return false;
  if (!requiredMemberIds.every((id) => loadedMembers.has(id))) return false;
  const firstFp = fingerprints.get(requiredMemberIds[0]);
  if (!firstFp) return false;
  return requiredMemberIds.every((id) => fingerprints.get(id) === firstFp);
}
