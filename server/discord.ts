import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { getUserByDiscordId, linkDiscordAccount, getUserByOpenId, unlinkDiscordAccount } from "./db";
import { sdk } from "./_core/sdk";

const DISCORD_API = "https://discord.com/api/v10";
const STATE_TTL_MS = 10 * 60 * 1000;

type DiscordState = { sub: string; exp: number; nonce: string };

function config() {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();
  const redirectUri = process.env.DISCORD_REDIRECT_URI?.trim();
  const stateSecret = (process.env.DISCORD_STATE_SECRET || clientSecret)?.trim();
  if (!clientId || !clientSecret || !redirectUri || !stateSecret) {
    throw new Error("Discord account linking is not configured.");
  }
  return { clientId, clientSecret, redirectUri, stateSecret };
}

function sign(value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function createState(openId: string, secret: string) {
  const payload = Buffer.from(JSON.stringify({ sub: openId, exp: Date.now() + STATE_TTL_MS, nonce: crypto.randomBytes(16).toString("hex") } satisfies DiscordState)).toString("base64url");
  return payload + "." + sign(payload, secret);
}

function verifyState(state: string, secret: string): DiscordState {
  const [payload, signature] = state.split(".");
  const expected = payload ? sign(payload, secret) : "";
  if (!payload || !signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("Invalid Discord OAuth state.");
  }
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as DiscordState;
  if (!decoded.sub || !decoded.nonce || !Number.isFinite(decoded.exp) || decoded.exp < Date.now()) {
    throw new Error("Expired Discord OAuth state.");
  }
  return decoded;
}

function formBody(values: Record<string, string>) {
  return new URLSearchParams(values).toString();
}

async function exchangeCode(code: string, cfg: ReturnType<typeof config>) {
  const response = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
    },
    body: formBody({ grant_type: "authorization_code", code, redirect_uri: cfg.redirectUri }),
  });
  if (!response.ok) throw new Error(`Discord token exchange failed: ${response.status}`);
  return response.json() as Promise<{ access_token: string; token_type: string; expires_in: number }>;
}

async function fetchDiscordUser(accessToken: string) {
  const response = await fetch(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Discord identity lookup failed: ${response.status}`);
  return response.json() as Promise<{ id: string; username?: string; global_name?: string | null }>;
}

async function revokeToken(accessToken: string, cfg: ReturnType<typeof config>) {
  await fetch(`${DISCORD_API}/oauth2/token/revoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
    },
    body: formBody({ token: accessToken, token_type_hint: "access_token" }),
  });
}

function safeReturnUri() {
  const value = process.env.DISCORD_APP_RETURN_URI?.trim();
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) throw new Error("DISCORD_APP_RETURN_URI must be an absolute app/web URI.");
  return value;
}

function buildAuthorizeUrl(openId: string, cfg: ReturnType<typeof config>) {
  const state = createState(openId, cfg.stateSecret);
  const authorize = new URL("https://discord.com/oauth2/authorize");
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", cfg.clientId);
  authorize.searchParams.set("scope", "identify");
  authorize.searchParams.set("redirect_uri", cfg.redirectUri);
  authorize.searchParams.set("state", state);
  return authorize.toString();
}

export function registerDiscordRoutes(app: Express) {
  app.get("/api/discord/authorize", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      const cfg = config();
      res.redirect(302, buildAuthorizeUrl(user.openId, cfg));
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : "Discord linking unavailable" });
    }
  });

  app.get("/api/discord/authorize-url", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      res.json({ url: buildAuthorizeUrl(user.openId, config()) });
    } catch (error) {
      res.status(401).json({ error: error instanceof Error ? error.message : "Discord linking unavailable" });
    }
  });

  app.get("/api/discord/callback", async (req: Request, res: Response) => {
    try {
      const code = typeof req.query.code === "string" ? req.query.code : "";
      const state = typeof req.query.state === "string" ? req.query.state : "";
      if (!code || !state) {
        res.status(400).json({ error: "code and state are required" });
        return;
      }
      const cfg = config();
      const identity = verifyState(state, cfg.stateSecret);
      const token = await exchangeCode(code, cfg);
      try {
        const discordUser = await fetchDiscordUser(token.access_token);
        const current = await getUserByOpenId(identity.sub);
        if (!current) throw new Error("Classic Era account no longer exists.");
        if (current.discordUserId && current.discordUserId !== discordUser.id) throw new Error("A different Discord account is already linked.");
        const linkedElsewhere = await getUserByDiscordId(discordUser.id);
        if (linkedElsewhere && linkedElsewhere.openId !== identity.sub) throw new Error("This Discord account is already linked to another Classic Era account.");
        await linkDiscordAccount(identity.sub, discordUser.id);
      } finally {
        await revokeToken(token.access_token, cfg);
      }
      const returnUri = safeReturnUri();
      if (returnUri) {
        const redirect = new URL(returnUri);
        redirect.searchParams.set("discord", "linked");
        res.redirect(302, redirect.toString());
      } else {
        res.json({ success: true, discord: "linked" });
      }
    } catch (error) {
      console.error("[Discord] callback failed", error);
      const returnUri = safeReturnUri();
      if (returnUri) {
        const redirect = new URL(returnUri);
        redirect.searchParams.set("discord", "error");
        res.redirect(302, redirect.toString());
      } else {
        res.status(400).json({ error: "Discord linking failed" });
      }
    }
  });

  app.get("/api/discord/status", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      const current = await getUserByOpenId(user.openId);
      res.json({ linked: Boolean(current?.discordUserId), discordUserId: current?.discordUserId ?? null });
    } catch {
      res.status(401).json({ error: "Not authenticated" });
    }
  });

  app.post("/api/discord/unlink", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      await unlinkDiscordAccount(user.openId);
      res.json({ success: true });
    } catch {
      res.status(401).json({ error: "Not authenticated" });
    }
  });
}
