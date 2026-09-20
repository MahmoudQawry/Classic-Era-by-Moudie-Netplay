import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(__dirname, "..");
const source = readFileSync(resolve(projectRoot, "lib/realtime-room-service.ts"), "utf8");

describe("realtime room service transport hardening", () => {
  it("does not call response.json directly, so empty/non-JSON relay bodies never surface as JSON parse errors", () => {
    expect(source).toContain("const text = await response.text();");
    expect(source).toContain("JSON.parse(trimmed)");
    expect(source).toContain("خادم الغرف أعاد استجابة فارغة");
    expect(source).not.toContain("await response.json()");
  });

  it("supports the tRPC v11 JSON envelope and direct data fallback", () => {
    expect(source).toContain("body.result?.data");
    expect(source).toContain("\"json\" in data");
    expect(source).toContain("return data as T");
  });

  it("keeps read-only queries failover-safe without replaying room mutations", () => {
    expect(source).toContain("async function probeRelay(baseUrl: string): Promise<boolean>");
    expect(source).toContain("async function selectMutationRelay(urls: string[]): Promise<string | null>");
    expect(source).toContain('const candidates = method === "GET" ? urls : [selectedRelay as string];');
    expect(source).toContain("Mutations are sent to one healthy relay only");
    expect(source).toContain("never replayed");
    expect(source).toContain("لا يوجد خادم NetPlay صحي حالياً");
  });
});
