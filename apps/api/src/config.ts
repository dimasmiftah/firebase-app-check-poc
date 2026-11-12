export interface Config {
  firebase: { projectId: string; clientEmail: string; privateKey: string };
  apps: { recaptcha: string; cloudflare: string };
  turnstile: { secretKey: string; expectedHostname: string; expectedAction: string | null };
  ttlMinutes: number;
  port: number;
  corsOrigin: string;
  exchangeRateLimitPerMinute: number;
}

export interface MissingConfig {
  firebase: string[];
  apps: string[];
  turnstile: string[];
}

const MIN_TTL_MINUTES = 30;
const MAX_TTL_MINUTES = 7 * 24 * 60;

export function loadConfig(env: Record<string, string | undefined>) {
  const read = (key: string) => env[key]?.trim() ?? "";
  const missingOf = (keys: string[]) => keys.filter((key) => !read(key));

  const ttl = Number(env.APP_CHECK_TTL_MINUTES ?? 30);
  const ttlMinutes = Number.isFinite(ttl)
    ? Math.min(Math.max(ttl, MIN_TTL_MINUTES), MAX_TTL_MINUTES)
    : MIN_TTL_MINUTES;

  const config: Config = {
    firebase: {
      projectId: read("FIREBASE_PROJECT_ID"),
      clientEmail: read("FIREBASE_CLIENT_EMAIL"),
      privateKey: read("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    },
    apps: {
      recaptcha: read("FIREBASE_RECAPTCHA_APP_ID"),
      cloudflare: read("FIREBASE_CLOUDFLARE_APP_ID"),
    },
    turnstile: {
      secretKey: read("TURNSTILE_SECRET_KEY"),
      expectedHostname: read("TURNSTILE_EXPECTED_HOSTNAME") || "localhost",
      expectedAction: read("TURNSTILE_EXPECTED_ACTION") || null,
    },
    ttlMinutes,
    port: Number(env.PORT ?? 3001),
    corsOrigin: read("CORS_ORIGIN") || "http://localhost:3000",
    exchangeRateLimitPerMinute: Number(env.EXCHANGE_RATE_LIMIT_PER_MINUTE) || 60,
  };

  const missing: MissingConfig = {
    firebase: missingOf(["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"]),
    apps: missingOf(["FIREBASE_RECAPTCHA_APP_ID", "FIREBASE_CLOUDFLARE_APP_ID"]),
    turnstile: missingOf(["TURNSTILE_SECRET_KEY"]),
  };

  return { config, missing };
}
