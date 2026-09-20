import { RollbackBuffer, targetFrame } from "./rollback-netcode";

export const NETPLAY_SYNC_INTERVAL_MS = 1500;
export const NETPLAY_MAX_DESYNC_FRAMES = 10;
export const NETPLAY_ROLLBACK_HISTORY_FRAMES = 120;
export const NETPLAY_MAX_ROLLBACK_FRAMES = 12;

export const JITTER_BUFFER_SIZES = {
  STABLE: 2,
  FAIR: 4,
  UNSTABLE: 6,
} as const;

export { RollbackBuffer, targetFrame };

export function normalizeSyncId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function shouldApplyAuthoritativeState(lastApplied: number, incoming: number): boolean {
  return incoming > lastApplied;
}

export function isDesyncSevere(predictedFrames: number, frameDrift: number): boolean {
  return predictedFrames > 20 || Math.abs(frameDrift) > 100;
}

export type NetworkQuality = "excellent" | "good" | "poor" | "lost";

export function classifyNetworkQuality(rttMs: number, jitterMs: number, packetLossPct: number): NetworkQuality {
  if (![rttMs, jitterMs, packetLossPct].every(Number.isFinite)) return "lost";
  if (packetLossPct >= 8 || rttMs >= 300) return "lost";
  if (packetLossPct >= 3 || rttMs >= 180 || jitterMs >= 50) return "poor";
  if (packetLossPct >= 1 || rttMs >= 90 || jitterMs >= 20) return "good";
  return "excellent";
}

export function calculateAdaptiveDelay(rttMs: number, jitterMs: number, currentDelay: number): number {
  let targetDelay = Math.max(2, Math.min(8, Math.trunc(currentDelay)));
  if (rttMs > 150 || jitterMs > 35) targetDelay = Math.min(8, targetDelay + 1);
  else if (rttMs < 60 && jitterMs < 15 && targetDelay > 2) targetDelay = Math.max(2, targetDelay - 1);
  return targetDelay;
}

export function rollbackWindowForQuality(quality: NetworkQuality): number {
  if (quality === "excellent") return 6;
  if (quality === "good") return 8;
  if (quality === "poor") return NETPLAY_MAX_ROLLBACK_FRAMES;
  return NETPLAY_MAX_ROLLBACK_FRAMES;
}
