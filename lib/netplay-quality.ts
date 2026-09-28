import type { Socket } from "socket.io-client";

export type NetplayQuality = {
  rttMs: number | null;
  jitterMs: number | null;
  probeLossPercent: number | null;
  grade: "CONNECTING" | "STABLE" | "FAIR" | "UNSTABLE";
  recommendedDelay?: number;
  packetLossStreak?: number;
};

/**
 * Identical lockstep window bounds to the Cloudflare relay, the Express relay,
 * the Android NetplayQualityMonitor and both native NetPlay clients. A mismatch
 * here is what silently discarded an adaptive recommendation.
 */
export const MIN_INPUT_DELAY_FRAMES = 2;
export const MAX_INPUT_DELAY_FRAMES = 45;
/** Minimum gap between delay requests; the relay enforces the same window. */
export const DELAY_REQUEST_COOLDOWN_MS = 2500;

const emptyQuality = (): NetplayQuality => ({
  rttMs: null,
  jitterMs: null,
  probeLossPercent: null,
  grade: "CONNECTING",
  recommendedDelay: 3,
  packetLossStreak: 0,
});

export function formatNetplayQuality(quality: NetplayQuality): string {
  if (quality.rttMs === null) return "PING — · CONNECTING";
  const delayInfo = quality.recommendedDelay ? ` · D${quality.recommendedDelay}` : "";
  return `PING ${quality.rttMs}ms · ${quality.grade}${delayInfo}`;
}

/**
 * Sizes the lockstep window from the measured relay path instead of fixed
 * buckets: player -> relay -> peer needs the round trip plus jitter headroom,
 * and a very distant relay can legitimately need far more than the old 8-frame
 * ceiling. Mirrors NetplayQuality.recommendedInputDelayFrames() on Android.
 */
export function calculateRecommendedDelay(rtt: number, jitter: number, loss: number): number {
  if (!Number.isFinite(rtt) || rtt <= 0) return 3;
  const safetyMs = loss >= 8 ? 40 : loss >= 3 ? 28 : jitter >= 50 ? 24 : 16;
  const effectiveTransitMs = rtt + jitter * 1.5 + safetyMs;
  const frames = Math.ceil(effectiveTransitMs / (1000 / 60)) + 1;
  return Math.max(MIN_INPUT_DELAY_FRAMES, Math.min(MAX_INPUT_DELAY_FRAMES, frames));
}

function calculateGrade(rtt: number | null, jitter: number | null, loss: number | null): NetplayQuality["grade"] {
  if (rtt === null) return "CONNECTING";
  const j = jitter ?? 0;
  const l = loss ?? 0;
  if (rtt <= 60 && j <= 12 && l < 1) return "STABLE";
  if (rtt <= 100 && j <= 25 && l <= 2) return "STABLE";
  if (rtt <= 150 && j <= 35 && l <= 4) return "FAIR";
  if (rtt <= 220 && j <= 50 && l <= 7) return "FAIR";
  return "UNSTABLE";
}

export type QualityProbeChannel = "netplay" | "universal";

export function startNetplayQualityMonitor(socket: Socket, onQuality: (quality: NetplayQuality) => void, channel: QualityProbeChannel = "netplay") {
  const probeEvent = channel === "universal" ? "universal:quality-probe" : "netplay:quality-probe";
  const pongEvent = channel === "universal" ? "universal:quality-pong" : "netplay:quality-pong";
  const delayEvent = channel === "universal" ? "universal:delay-request" : "netplay:delay-request";
  let sequence = 0;
  let previousRtt: number | null = null;
  let smoothedRtt: number | null = null;
  let smoothedJitter: number | null = null;
  let lastRequestedDelay: number | null = null;
  let lastDelayRequestAt = 0;
  let authoritativeDelay: number | null = null;
  const pending = new Map<number, number>();
  const outcomes: boolean[] = [];
  let lossStreak = 0;
  let maxLossStreak = 0;

  const recordOutcome = (received: boolean) => {
    outcomes.push(received);
    while (outcomes.length > 30) outcomes.shift();
    if (!received) {
      lossStreak++;
      maxLossStreak = Math.max(maxLossStreak, lossStreak);
    } else {
      lossStreak = 0;
    }
  };

  const requestDelayIfNeeded = (recommendedDelay: number) => {
    const bounded = Math.max(MIN_INPUT_DELAY_FRAMES, Math.min(MAX_INPUT_DELAY_FRAMES, Math.round(recommendedDelay)));
    if (lastRequestedDelay === bounded || !socket.connected) return;
    const now = Date.now();
    // One request per cooldown window: the two devices must not trade delay
    // changes back and forth while the measured link is unchanged.
    if (now - lastDelayRequestAt < DELAY_REQUEST_COOLDOWN_MS) return;
    const reason = lastRequestedDelay !== null && bounded < lastRequestedDelay ? "stable" : "network-adaptation";
    lastDelayRequestAt = now;
    lastRequestedDelay = bounded;
    socket.emit(delayEvent, { delay: bounded, reason });
  };

  // The relay is the authority: adopt the confirmed value and never keep asking
  // for something the relay has already refused.
  const onDelayUpdate = (payload: { delay?: unknown; accepted?: unknown }) => {
    const confirmed = Math.round(Number(payload?.delay));
    if (!Number.isFinite(confirmed)) return;
    const bounded = Math.max(MIN_INPUT_DELAY_FRAMES, Math.min(MAX_INPUT_DELAY_FRAMES, confirmed));
    lastRequestedDelay = bounded;
    authoritativeDelay = bounded;
  };

  const publish = () => {
    const loss = outcomes.length ? Math.floor((outcomes.filter((outcome) => !outcome).length * 100) / outcomes.length) : null;
    const rtt = smoothedRtt === null ? null : Math.round(smoothedRtt);
    const jitter = smoothedJitter === null ? null : Math.round(smoothedJitter);
    const grade = calculateGrade(rtt, jitter, loss);
    const recommendedDelay = rtt !== null ? calculateRecommendedDelay(rtt, jitter ?? 0, loss ?? 0) : authoritativeDelay ?? 3;

    onQuality({
      rttMs: rtt,
      jitterMs: jitter,
      probeLossPercent: loss,
      grade,
      recommendedDelay,
      packetLossStreak: maxLossStreak,
    });
    requestDelayIfNeeded(recommendedDelay);

    if (outcomes.length >= 30) maxLossStreak = 0;
  };

  const prune = (now: number) => {
    let expiredCount = 0;
    for (const [id, sentAt] of pending) {
      if (now - sentAt < 3_000) continue;
      pending.delete(id);
      recordOutcome(false);
      expiredCount++;
    }
    if (expiredCount > 0) publish();
  };

  const onPong = (payload: { sequence?: unknown; serverTime?: unknown }) => {
    const id = Number(payload?.sequence);
    const sentAt = pending.get(id);
    if (!Number.isSafeInteger(id) || sentAt === undefined) return;
    pending.delete(id);
    const rtt = Math.max(0, Date.now() - sentAt);
    const delta = previousRtt === null ? 0 : Math.abs(rtt - previousRtt);
    previousRtt = rtt;
    const rttAlpha = delta > 30 ? 0.5 : 0.3;
    const jitterAlpha = 0.35;
    smoothedRtt = smoothedRtt === null ? rtt : (smoothedRtt * (1 - rttAlpha)) + (rtt * rttAlpha);
    smoothedJitter = smoothedJitter === null ? delta : (smoothedJitter * (1 - jitterAlpha)) + (delta * jitterAlpha);
    recordOutcome(true);
    publish();
  };

  const tick = () => {
    const now = Date.now();
    prune(now);
    if (socket.connected) {
      const id = sequence++;
      pending.set(id, now);
      socket.emit(probeEvent, { sequence: id });
    }
    publish();
  };

  socket.on(pongEvent, onPong);
  socket.on("netplay:delay-update", onDelayUpdate);
  tick();
  const timer = setInterval(tick, 1_200);

  return () => {
    clearInterval(timer);
    socket.off(pongEvent, onPong);
    socket.off("netplay:delay-update", onDelayUpdate);
  };
}

export { emptyQuality };

export function getQualityColor(grade: NetplayQuality["grade"]): string {
  switch (grade) {
    case "STABLE": return "#48C78E";
    case "FAIR": return "#F4B942";
    case "UNSTABLE": return "#F26B5B";
    default: return "#9BAFC4";
  }
}

export function shouldIncreaseDelay(quality: NetplayQuality, currentDelay: number, predictedFrames: number): boolean {
  if (predictedFrames > 15) return true;
  if (quality.grade === "UNSTABLE" && currentDelay < 6) return true;
  if (quality.jitterMs !== null && quality.jitterMs > 40 && currentDelay < 5) return true;
  if (quality.probeLossPercent !== null && quality.probeLossPercent > 5 && currentDelay < 6) return true;
  return false;
}
