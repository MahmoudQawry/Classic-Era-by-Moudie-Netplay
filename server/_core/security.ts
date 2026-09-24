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
    try {
      const parsed = new URL(origin);
      if (parsed.protocol !== "https:") {
        throw new Error(`Production CORS origin must use HTTPS: ${origin}`);
      }
      if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
        throw new Error(`Production CORS origin must be a plain HTTPS origin: ${origin}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Production CORS origin")) throw error;
      throw new Error(`Invalid production CORS origin: ${origin}`);
    }
  }

  const livekit = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"];
  const configuredLiveKit = livekit.filter(hasValue);
  if (configuredLiveKit.length > 0 && configuredLiveKit.length !== livekit.length) {
    throw new Error("LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be configured together.");
  }

  const forbiddenClientSecrets = ["LIVEKIT_API_SECRET", "DATABASE_URL", "BUILT_IN_FORGE_API_KEY"];
  for (const name of forbiddenClientSecrets) {
    const value = process.env[name];
    if (value && (name.startsWith("EXPO_PUBLIC_") || name.includes("PUBLIC"))) {
      throw new Error(`Secret ${name} must never be exposed as a client environment variable.`);
    }
  }
}

export function securityHeaders(res: { setHeader(name: string, value: string): void }) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), payment=()");
}
