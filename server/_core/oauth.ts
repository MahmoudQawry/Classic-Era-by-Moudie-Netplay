import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const.js";
import type { Express, Request, Response } from "express";
import { getUserByOpenId, upsertUser } from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

const MOBILE_SESSION_MS = 90 * 24 * 60 * 60 * 1000;
const AUTH_RATE_WINDOW_MS = 60_000;
const AUTH_RATE_MAX = 12;
const AUTH_RATE_ERROR = "Too many authentication attempts.";
const authAttempts = new Map<string, number[]>();

function assertAuthRateLimit(req: Request) {
  const ip = req.ip || "unknown";
  const now = Date.now();
  const recent = (authAttempts.get(ip) ?? []).filter((at) => now - at < AUTH_RATE_WINDOW_MS);
  if (recent.length >= AUTH_RATE_MAX) throw new Error(AUTH_RATE_ERROR);
  recent.push(now);
  authAttempts.set(ip, recent);
  if (authAttempts.size > 10_000) {
    for (const [key, timestamps] of authAttempts) {
      if (timestamps.every((at) => now - at >= AUTH_RATE_WINDOW_MS)) authAttempts.delete(key);
    }
  }
}

function authErrorStatus(error: unknown, fallback: number) {
  return error instanceof Error && error.message === AUTH_RATE_ERROR ? 429 : fallback;
}

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

async function syncUser(userInfo: {
  openId?: string | null;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  platform?: string | null;
}) {
  if (!userInfo.openId) throw new Error("openId missing from user info");
  const lastSignedIn = new Date();
  await upsertUser({
    openId: userInfo.openId,
    name: userInfo.name || null,
    email: userInfo.email ?? null,
    loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
    lastSignedIn,
  });
  const saved = await getUserByOpenId(userInfo.openId);
  return saved ?? {
    openId: userInfo.openId,
    name: userInfo.name,
    email: userInfo.email,
    loginMethod: userInfo.loginMethod ?? null,
    lastSignedIn,
  };
}

function buildUserResponse(
  user:
    | Awaited<ReturnType<typeof getUserByOpenId>>
    | { openId: string; name?: string | null; email?: string | null; loginMethod?: string | null; lastSignedIn?: Date | null },
) {
  return {
    id: (user as any)?.id ?? null,
    openId: user?.openId ?? null,
    name: user?.name ?? null,
    email: user?.email ?? null,
    loginMethod: user?.loginMethod ?? null,
    lastSignedIn: (user?.lastSignedIn ?? new Date()).toISOString(),
  };
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    try {
      assertAuthRateLimit(req);
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      await syncUser(userInfo);
      const sessionToken = await sdk.createSessionToken(userInfo.openId!, { name: userInfo.name || "", expiresInMs: ONE_YEAR_MS });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      const frontendUrl = process.env.EXPO_WEB_PREVIEW_URL || process.env.EXPO_PACKAGER_PROXY_URL || "http://localhost:8081";
      res.redirect(302, frontendUrl);
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(authErrorStatus(error, 500)).json({ error: error instanceof Error && error.message === AUTH_RATE_ERROR ? AUTH_RATE_ERROR : "OAuth callback failed" });
    }
  });

  app.get("/api/oauth/mobile", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    try {
      assertAuthRateLimit(req);
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      const user = await syncUser(userInfo);
      const sessionToken = await sdk.createSessionToken(userInfo.openId!, { name: userInfo.name || "", expiresInMs: MOBILE_SESSION_MS });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: MOBILE_SESSION_MS });
      res.json({ app_session_id: sessionToken, user: buildUserResponse(user) });
    } catch (error) {
      console.error("[OAuth] Mobile exchange failed", error);
      res.status(authErrorStatus(error, 500)).json({ error: error instanceof Error && error.message === AUTH_RATE_ERROR ? AUTH_RATE_ERROR : "OAuth mobile exchange failed" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      res.json({ user: buildUserResponse(user) });
    } catch {
      res.status(401).json({ error: "Not authenticated", user: null });
    }
  });

  app.post("/api/auth/session", async (req: Request, res: Response) => {
    try {
      assertAuthRateLimit(req);
      const user = await sdk.authenticateRequest(req);
      const authHeader = req.headers.authorization || req.headers.Authorization;
      if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
        res.status(400).json({ error: "Bearer token required" });
        return;
      }
      const token = authHeader.slice("Bearer ".length).trim();
      if (token.length < 20 || token.length > 4096) {
        res.status(400).json({ error: "Invalid bearer token" });
        return;
      }
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: MOBILE_SESSION_MS });
      res.json({ success: true, user: buildUserResponse(user) });
    } catch (error) {
      const status = authErrorStatus(error, 401);
      res.status(status).json({ error: status === 429 ? AUTH_RATE_ERROR : "Invalid token" });
    }
  });
}
