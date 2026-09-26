import { describe, expect, it } from "vitest";

const read = (path: string) => {
  const fs = require("node:fs");
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
};

describe("room activation guard", () => {
  it("uses a conditional waiting-to-active database transition", () => {
    const source = read("../server/db.ts");
    expect(source).toContain('eq(gameRooms.status, "waiting")');
    expect(source).toContain("affectedRows");
  });
});
