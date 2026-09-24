import { afterEach, describe, expect, it, vi } from "vitest";
import { securityHeaders, validateProductionEnvironment } from "../server/_core/security";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe("production security configuration", () => {
  it("requires database and explicit CORS origins", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.DATABASE_URL;
    delete process.env.ALLOWED_ORIGINS;
    expect(() => validateProductionEnvironment()).toThrow(/DATABASE_URL, ALLOWED_ORIGINS/);
  });

  it("rejects wildcard CORS in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "mysql://example.invalid/db");
    vi.stubEnv("ALLOWED_ORIGINS", "*");
    expect(() => validateProductionEnvironment()).toThrow(/must not contain/);
  });

  it("requires all LiveKit server credentials together", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "mysql://example.invalid/db");
    vi.stubEnv("ALLOWED_ORIGINS", "https://classic.example.com");
    vi.stubEnv("LIVEKIT_URL", "wss://voice.example.com");
    vi.stubEnv("LIVEKIT_API_KEY", "key");
    delete process.env.LIVEKIT_API_SECRET;
    expect(() => validateProductionEnvironment()).toThrow(/LIVEKIT_URL/);
  });

  it("adds baseline security headers", () => {
    const headers = new Map<string, string>();
    securityHeaders({ setHeader: (name, value) => headers.set(name, value) });
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
  });
});
