import { Hono } from "hono";
import { getConnInfo } from "hono/bun";
import type { Context } from "hono";
import type { ExchangeSuccess } from "@poc/shared";
import type { Deps } from "../app";
import { createRateLimiter } from "../services/rate-limit";

const MAX_TURNSTILE_TOKEN_LENGTH = 2048;

function clientKey(c: Context) {
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function exchangeRoute(deps: Deps) {
  const route = new Hono();
  const limiter = createRateLimiter(deps.config.exchangeRateLimitPerMinute, 60_000, deps.now);

  route.post("/", async (c) => {
    if (!deps.exchangeReady) {
      return c.json(
        {
          success: false,
          error: "not_configured",
          message: "Firebase Admin, app IDs or Turnstile secret are missing in apps/api/.env",
          missing: [...deps.missing.firebase, ...deps.missing.apps, ...deps.missing.turnstile],
        },
        503,
      );
    }

    const limit = limiter(clientKey(c));
    if (!limit.allowed) {
      c.header("Retry-After", String(limit.retryAfterSeconds));
      return c.json({ success: false, error: "rate_limited", message: "Too many exchange requests" }, 429);
    }

    const body = await c.req.json().catch(() => null);
    const turnstileToken = body?.turnstileToken;
    if (typeof turnstileToken !== "string" || !turnstileToken || turnstileToken.length > MAX_TURNSTILE_TOKEN_LENGTH) {
      return c.json({ success: false, error: "invalid_request", message: "turnstileToken is required" }, 400);
    }

    let result;
    try {
      result = await deps.verifyTurnstile(turnstileToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Siteverify unreachable";
      return c.json({ success: false, error: "siteverify_unavailable", message }, 502);
    }

    if (!result.success) {
      const codes = result["error-codes"] ?? [];
      const reused = codes.includes("timeout-or-duplicate");
      return c.json(
        {
          success: false,
          error: reused ? "turnstile_expired_or_reused" : "turnstile_failed",
          message: "Turnstile verification failed",
          errorCodes: codes,
        },
        403,
      );
    }

    if (result.hostname !== deps.config.turnstile.expectedHostname) {
      return c.json(
        {
          success: false,
          error: "hostname_mismatch",
          message: `Unexpected Turnstile hostname: ${result.hostname ?? "none"}`,
        },
        403,
      );
    }

    const expectedAction = deps.config.turnstile.expectedAction;
    if (expectedAction && result.action !== expectedAction) {
      return c.json(
        { success: false, error: "action_mismatch", message: `Unexpected Turnstile action: ${result.action ?? "none"}` },
        403,
      );
    }

    const ttlMillis = deps.config.ttlMinutes * 60_000;
    let issued;
    try {
      issued = await deps.createAppCheckToken(deps.config.apps.cloudflare, ttlMillis);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Token creation failed";
      return c.json({ success: false, error: "token_creation_failed", message }, 502);
    }
    const response: ExchangeSuccess = {
      success: true,
      token: issued.token,
      ttlMillis: issued.ttlMillis,
      expireTimeMillis: (deps.now?.() ?? Date.now()) + issued.ttlMillis,
    };
    return c.json(response);
  });

  return route;
}
