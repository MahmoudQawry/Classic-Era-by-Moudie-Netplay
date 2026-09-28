import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(__dirname, "..", path), "utf8");

describe("withdrawn Android release containment", () => {
  it("keeps the unverified Android build paused and manual-only", () => {
    const workflow = read(".github/workflows/android-build-reset.yml");
    const triggers = workflow.match(/^on:\n([\s\S]*?)(?=^\S)/m)?.[1];
    expect(triggers?.trim()).toBe("workflow_dispatch:");
    expect(workflow).toContain("    if: ${{ false }}");
  });

  it("does not grant release-write permission or overwrite the withdrawn tag", () => {
    const workflow = read(".github/workflows/android-build-reset.yml");
    expect(workflow).toContain("  contents: read");
    expect(workflow).not.toContain("contents: write");
    expect(workflow).not.toContain("gh release");
    expect(workflow).not.toContain("--clobber");
    expect(workflow).not.toContain('TAG="android-test-latest"');
    expect(workflow).toContain("actions/upload-artifact@");
    expect(workflow).toContain("android-review-${{ github.sha }}");
  });

  it("records the actual approved binary without inventing its source commit", () => {
    const reference = JSON.parse(read("docs/releases/1.11.2-approved-apk.json"));
    expect(reference.sha256).toBe("bde99a4dfcac736c08d4f59b62cf6018e2a7bae2b71f08a8fcf16df3e34d4806");
    expect(reference.bytes).toBe(60468101);
    expect(reference.package).toBe("com.app.moudienetplay");
    expect(reference.version_name).toBe("1.11.2");
    expect(reference.version_code).toBe(53);
    expect(reference.abis).toEqual(["arm64-v8a"]);
    expect(reference.min_sdk).toBe(24);
    expect(reference.emulator_cores).toHaveLength(6);
    expect(reference.source.status).toBe("unverified");
    expect(reference.source.git_commit).toBeNull();
  });
});
