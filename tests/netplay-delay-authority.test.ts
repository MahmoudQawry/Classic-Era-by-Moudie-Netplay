import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MAX_INPUT_DELAY_FRAMES, MIN_INPUT_DELAY_FRAMES, calculateRecommendedDelay } from "../lib/netplay-quality";

const root = resolve(__dirname, "..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

const worker = read("cloudflare-netplay/src/index.ts");
const relay = read("server/netplay.ts");
const quality = read("lib/netplay-quality.ts");
const universalClient = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/UniversalNetplayClient.kt");
const ps1Client = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/Ps1NetplayClient.kt");
const universalActivity = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/UniversalLibretroPlayerActivity.kt");
const ps1Activity = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/PS1PlayerActivity.kt");

/**
 * Regression guard for the lockstep input-delay contract.
 *
 * The devices, both relays and the JavaScript monitor must agree on the window
 * (2..45 frames), on who owns the value (the relay), and on how often it may
 * change. Any one of them drifting back to its own private bucket reintroduces
 * the exact defect that made a session slow down and then end: two devices
 * playing the same frame with different input delays.
 */
describe("NetPlay input-delay authority", () => {
  it("uses one window across the relay, the clients and the JS monitor", () => {
    expect(worker).toContain("const MIN_INPUT_DELAY = 2;");
    expect(worker).toContain("const MAX_INPUT_DELAY = 45;");
    expect(relay).toContain("const MIN_INPUT_DELAY = 2;");
    expect(relay).toContain("const MAX_INPUT_DELAY = 45;");
    expect(MIN_INPUT_DELAY_FRAMES).toBe(2);
    expect(MAX_INPUT_DELAY_FRAMES).toBe(45);
    for (const source of [worker, relay]) {
      expect(source).not.toMatch(/delay\s*>\s*8\b/);
      expect(source).not.toMatch(/delay\s*<=\s*8\b/);
    }
    expect(quality).not.toContain("Math.min(8");
    expect(universalClient).toContain("const val MAX_INPUT_DELAY=45L");
    expect(ps1Client).toContain("const val MAX_INPUT_DELAY=45L");
  });

  it("keeps the relay as the only writer of the accepted delay", () => {
    // The relay answers every request with the authoritative value.
    expect(worker).toContain('event:"netplay:delay-update"');
    expect(worker).toContain("accepted:false");
    expect(relay).toContain("accepted: false");
    // A client must not apply its own recommendation to the running session.
    for (const client of [universalClient, ps1Client]) {
      expect(client).not.toContain("onQuality={quality->onQuality(quality);onDelayUpdate?.invoke");
      expect(client).toContain('"netplay:delay-update"->{val d=p.optLong("delay",-1L);if(d in MIN_INPUT_DELAY..MAX_INPUT_DELAY)');
      expect(client).toContain("delayRequestInFlight=false;onDelayUpdate?.invoke(d)");
    }
    for (const activity of [universalActivity, ps1Activity]) {
      expect(activity).toContain("onDelayUpdate = { confirmed -> runOnUiThread {");
      expect(activity).toContain("MIN_NETPLAY_DELAY_FRAMES, MAX_NETPLAY_DELAY_FRAMES");
    }
  });

  it("rate limits delay changes so the two devices cannot ping-pong", () => {
    expect(worker).toContain("const DELAY_CHANGE_COOLDOWN_MS = 2500;");
    expect(worker).toContain("coolingDown");
    expect(relay).toContain("const DELAY_CHANGE_COOLDOWN_MS = 2500;");
    expect(relay).toContain("coolingDown");
    expect(quality).toContain("DELAY_REQUEST_COOLDOWN_MS");
    expect(universalClient).toContain("DELAY_REQUEST_COOLDOWN_MS=2500L");
    expect(ps1Client).toContain("DELAY_REQUEST_COOLDOWN_MS=2500L");
  });

  it("never widens the window privately when a frame stalls", () => {
    // The stall path may only ask the relay; a local bump desynchronizes the peer.
    expect(universalActivity).not.toContain("netplayInputDelayFrames++");
    expect(ps1Activity).not.toContain("netplayInputDelayFrames++");
    expect(universalActivity).toContain('requestDelayIncrease(netplayInputDelayFrames + 2, "lockstep-stall")');
    expect(ps1Activity).toContain('requestDelayIncrease(netplayInputDelayFrames + 2, "high-prediction")');
  });

  it("sizes the window from the measured path within the shared bounds", () => {
    expect(calculateRecommendedDelay(0, 0, 0)).toBe(3);
    expect(calculateRecommendedDelay(20, 2, 0)).toBeGreaterThanOrEqual(MIN_INPUT_DELAY_FRAMES);
    expect(calculateRecommendedDelay(600, 60, 9)).toBe(MAX_INPUT_DELAY_FRAMES);
    expect(calculateRecommendedDelay(45, 5, 0)).toBeLessThanOrEqual(MAX_INPUT_DELAY_FRAMES);
    expect(calculateRecommendedDelay(45, 5, 0)).toBeGreaterThanOrEqual(MIN_INPUT_DELAY_FRAMES);
    // A distant relay must be allowed a larger window than the retired 8-frame cap.
    expect(calculateRecommendedDelay(320, 40, 2)).toBeGreaterThan(8);
  });
});
