import type { Socket } from "socket.io-client";

export type NetplayQuality = {
  rttMs: number | null;
  jitterMs: number | null;
  probeLossPercent: number | null;
  grade: "CONNECTING" | "STABLE" | "FAIR" | "UNSTABLE";
  recommendedDelay?: number;
  packetLossStreak?: number;
};

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

function calculateRecommendedDelay(rtt: number, jitter: number, loss: number): number {
  if (rtt <= 50 && jitter <= 10 && loss < 1) return 2;
  if (rtt <= 80 && jitter <= 20 && loss < 2) return 3;
  if (rtt <= 120 && jitter <= 30 && loss <= 3) return 4;
  if (rtt <= 180 && jitter <= 45 && loss <= 5) return 5;
  if (rtt <= 250 && jitter <= 60) return 6;
  return 7;
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
    const bounded = Math.max(2, Math.min(8, Math.round(recommendedDelay)));
    if (lastRequestedDelay === bounded || !socket.connected) return;
    const reason = lastRequestedDelay !== null && bounded < lastRequestedDelay ? "stable" : "network-adaptation";
    socket.emit(delayEvent, { delay: bounded, reason });
    lastRequestedDelay = bounded;
  };

  const publish = () => {
    const loss = outcomes.length ? Math.floor((outcomes.filter((outcome) => !outcome).length * 100) / outcomes.length) : null;
    const rtt = smoothedRtt === null ? null : Math.round(smoothedRtt);
    const jitter = smoothedJitter === null ? null : Math.round(smoothedJitter);
    const grade = calculateGrade(rtt, jitter, loss);
    const recommendedDelay = rtt !== null ? calculateRecommendedDelay(rtt, jitter ?? 0, loss ?? 0) : 3;

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
  tick();
  const timer = setInterval(tick, 1_200);

  return () => {
    clearInterval(timer);
    socket.off(pongEvent, onPong);
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
