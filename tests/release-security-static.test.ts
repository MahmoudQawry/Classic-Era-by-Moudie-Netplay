import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("release security guards", () => {
  it("does not ship high-risk unused Android permissions", () => {
    const manifest = read("android/app/src/main/AndroidManifest.xml");
    expect(manifest).not.toMatch(/android\.permission\.(CAMERA|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|SYSTEM_ALERT_WINDOW|POST_NOTIFICATIONS)/);
  });

  it("keeps server-only credential names out of client config", () => {
    const config = read("app.config.ts");
    expect(config).not.toContain("LIVEKIT_API_SECRET");
    expect(config).not.toContain("DATABASE_URL");
    expect(config).not.toContain("TURN_SHARED_SECRET");
  });

  it("keeps runtime env examples free of credential-like demo values", () => {
    const example = read("infra/realtime/.env.example");
    expect(example).not.toContain("moudie_dev_key");
    expect(example).not.toMatch(/(LIVEKIT_API_SECRET|REDIS_PASSWORD|TURN_SHARED_SECRET)=.{8,}/);
  });

  it("keeps superseded audit files removed", () => {
    for (const path of [
      "FINAL_CODE_AUDIT_AR.md",
      "FINAL_UPDATE_REPORT_AR.md",
      "LOCALIZATION_AND_VERIFICATION_REPORT_AR.md",
      "REPOSITORY_AUDIT_REPORT_AR.md",
      "todo.md",
    ]) {
      expect(existsSync(resolve(root, path))).toBe(false);
    }
  });
});
