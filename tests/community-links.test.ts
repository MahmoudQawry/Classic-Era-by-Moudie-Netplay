import { describe, expect, it } from "vitest";
import { COMMUNITY_LINKS } from "../lib/community-links";

describe("official community links", () => {
  it("uses the exact published Discord and Telegram destinations", () => {
    expect(COMMUNITY_LINKS.discord).toBe("https://discord.gg/9KtKFVH5m");
    expect(COMMUNITY_LINKS.telegram).toBe("https://t.me/ClassicEraByMoudieNetplay");
  });
  it("contains no credential material", () => {
    expect(COMMUNITY_LINKS.discord).not.toMatch(/token|secret/i);
    expect(COMMUNITY_LINKS.telegram).not.toMatch(/token|secret/i);
  });
});
