import { describe, expect, it } from "vitest";
import { calculateAdaptiveDelay, classifyNetworkQuality, rollbackWindowForQuality } from "../lib/netplay-sync";

describe("NetPlay network quality policy", () => {
  it("classifies latency, jitter and loss together", () => {
    expect(classifyNetworkQuality(40, 4, 0.1)).toBe("excellent");
    expect(classifyNetworkQuality(110, 22, 1.2)).toBe("good");
    expect(classifyNetworkQuality(210, 60, 4)).toBe("poor");
    expect(classifyNetworkQuality(350, 10, 0)).toBe("lost");
  });

  it("keeps adaptive delay bounded", () => {
    expect(calculateAdaptiveDelay(300, 80, 2)).toBe(3);
    expect(calculateAdaptiveDelay(20, 4, 8)).toBe(7);
    expect(calculateAdaptiveDelay(20, 4, 2)).toBe(2);
  });

  it("allocates a larger rollback window under degraded conditions", () => {
    expect(rollbackWindowForQuality("excellent")).toBeLessThan(rollbackWindowForQuality("poor"));
  });
});
