import { createApp, type Deps } from "../src/app";
import { loadConfig } from "../src/config";
import type { TurnstileResult } from "../src/services/turnstile";

export const RECAPTCHA_APP = "1:1:web:recaptcha";
export const CLOUDFLARE_APP = "1:1:web:cloudflare";
export const OTHER_APP = "1:1:web:other";

export function fakeAppCheck() {
  const consumed = new Set<string>();
  const verifyAppCheckToken: Deps["verifyAppCheckToken"] = async (token, consume) => {
    const [kind, appId] = token.split("|");
    if (kind === "expired") throw new Error("Firebase App Check token has expired");
    if (kind !== "valid" || !appId) throw new Error("Decoding App Check token failed");
    if (!consume) return { appId, alreadyConsumed: false };
    await Promise.resolve();
    const alreadyConsumed = consumed.has(token);
    consumed.add(token);
    return { appId, alreadyConsumed };
  };
  return { verifyAppCheckToken, consumed };
}

export function buildApp(overrides: Partial<Deps> = {}) {
  const { config, missing } = loadConfig({
    FIREBASE_PROJECT_ID: "p",
    FIREBASE_CLIENT_EMAIL: "e",
    FIREBASE_PRIVATE_KEY: "k",
    FIREBASE_RECAPTCHA_APP_ID: RECAPTCHA_APP,
    FIREBASE_CLOUDFLARE_APP_ID: CLOUDFLARE_APP,
    TURNSTILE_SECRET_KEY: "s",
    TURNSTILE_EXPECTED_HOSTNAME: "localhost",
  });
  const issued: { appId: string; ttlMillis: number }[] = [];
  const usedTurnstile = new Set<string>();
  const verifyTurnstile = async (token: string): Promise<TurnstileResult> => {
    if (token === "bad-host") return { success: true, hostname: "evil.example", "error-codes": [] };
    if (!token.startsWith("good") || usedTurnstile.has(token)) {
      return { success: false, "error-codes": [usedTurnstile.has(token) ? "timeout-or-duplicate" : "invalid-input-response"] };
    }
    usedTurnstile.add(token);
    return { success: true, hostname: "localhost", "error-codes": [] };
  };
  const deps: Deps = {
    config,
    missing,
    appCheckReady: true,
    exchangeReady: true,
    verifyAppCheckToken: fakeAppCheck().verifyAppCheckToken,
    createAppCheckToken: async (appId, ttlMillis) => {
      issued.push({ appId, ttlMillis });
      return { token: `valid|${appId}`, ttlMillis };
    },
    verifyTurnstile,
    ...overrides,
  };
  return { app: createApp(deps), issued, deps };
}

export const withToken = (token: string, method = "GET") => ({ method, headers: { "X-Firebase-AppCheck": token } });
