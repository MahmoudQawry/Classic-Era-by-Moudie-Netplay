const REQUIRED_PRODUCTION_VARS = ["DATABASE_URL", "ALLOWED_ORIGINS"] as const;

function hasValue(name: string) {
  return Boolean(process.env[name]?.trim());
}

export function validateProductionEnvironment() {
  if (process.env.NODE_ENV !== "production") return;

  const missing = REQUIRED_PRODUCTION_VARS.filter((name) => !hasValue(name));
  if (missing.length) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }

  const origins = process.env.ALLOWED_ORIGINS!.split(",").map((value) => value.trim()).filter(Boolean);
  if (!origins.length || origins.includes("*")) {
    throw new Error("Production ALLOWED_ORIGINS must contain one or more explicit origins and must not contain '*'.");
  }

  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`Invalid production CORS origin: ${origin}`);
    }
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error(`Production CORS origin must be a plain HTTPS origin: ${origin}`);
    }
  }

  const discord = ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_REDIRECT_URI"];
  const configuredDiscord = discord.filter(hasValue);
  if (configuredDiscord.length > 0 && configuredDiscord.length !== discord.length) {
    throw new Error("DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET and DISCORD_REDIRECT_URI must be configured together.");
  }
  if (hasValue("DISCORD_CLIENT_ID") && hasValue("DISCORD_REDIRECT_URI")) {
    const redirect = new URL(process.env.DISCORD_REDIRECT_URI!);
    if (redirect.protocol !== "https:") throw new Error("Production DISCORD_REDIRECT_URI must use HTTPS.");
  }

  const livekit = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"];
  const configuredLiveKit = livekit.filter(hasValue);
  if (configuredLiveKit.length > 0 && configuredLiveKit.length !== livekit.length) {
    throw new Error("LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be configured together.");
  }
}

export function securityHeaders(res: { setHeader(name: string, value: string): void }) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), payment=()");
}
