import type { MiddlewareHandler } from "hono";
import type { Provider } from "@poc/shared";
import type { Deps } from "../app";

export interface AppCheckVariables {
  appCheck: { appId: string; provider: Provider; verifyMs: number };
}

export function requireAppCheck(
  deps: Deps,
  options: { consume: boolean },
): MiddlewareHandler<{ Variables: AppCheckVariables }> {
  return async (c, next) => {
    if (!deps.appCheckReady) {
      return c.json(
        {
          success: false,
          error: "not_configured",
          message: "Firebase Admin credentials or app IDs are missing in apps/api/.env",
          missing: [...deps.missing.firebase, ...deps.missing.apps],
        },
        503,
      );
    }

    const token = c.req.header("X-Firebase-AppCheck");
    if (!token) {
      return c.json({ success: false, error: "missing_token", message: "X-Firebase-AppCheck header is required" }, 401);
    }

    const startedAt = performance.now();
    let verified;
    try {
      verified = await deps.verifyAppCheckToken(token, options.consume);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Token verification failed";
      const expired = /expired/i.test(message);
      return c.json(
        { success: false, error: expired ? "token_expired" : "invalid_token", message },
        401,
      );
    }
    const verifyMs = performance.now() - startedAt;

    if (options.consume && verified.alreadyConsumed) {
      return c.json(
        { success: false, error: "token_already_consumed", message: "This App Check token was already consumed" },
        409,
      );
    }

    const provider = (Object.keys(deps.config.apps) as Provider[]).find(
      (key) => deps.config.apps[key] === verified.appId,
    );
    if (!provider) {
      return c.json(
        { success: false, error: "app_not_allowed", message: `Firebase app ${verified.appId} is not approved` },
        403,
      );
    }

    c.set("appCheck", { appId: verified.appId, provider, verifyMs });
    await next();
  };
}
