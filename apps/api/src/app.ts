import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ApiConfig, ApiSuccess } from "@poc/shared";
import type { Config, MissingConfig } from "./config";
import type { TurnstileResult } from "./services/turnstile";
import { regularRoute } from "./routes/regular";
import { sensitiveRoute } from "./routes/sensitive";
import { exchangeRoute } from "./routes/exchange";
import { diagRoute } from "./routes/diag";
import type { AssessRecaptcha } from "./services/recaptcha-assessment";

export interface Deps {
  config: Config;
  missing: MissingConfig;
  appCheckReady: boolean;
  exchangeReady: boolean;
  verifyAppCheckToken(token: string, consume: boolean): Promise<{ appId: string; alreadyConsumed: boolean }>;
  createAppCheckToken(appId: string, ttlMillis: number): Promise<{ token: string; ttlMillis: number }>;
  verifyTurnstile(token: string): Promise<TurnstileResult>;
  assessRecaptcha?: AssessRecaptcha;
  now?: () => number;
}

export function createApp(deps: Deps) {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: deps.config.corsOrigin,
      allowHeaders: ["Content-Type", "X-Firebase-AppCheck"],
      allowMethods: ["GET", "POST", "OPTIONS"],
    }),
  );

  app.get("/api/public", (c) => {
    const body: ApiSuccess = { success: true, message: "Public endpoint" };
    return c.json(body);
  });

  app.get("/api/config", (c) => {
    const body: ApiConfig = {
      appCheckReady: deps.appCheckReady,
      exchangeReady: deps.exchangeReady,
      missing: deps.missing,
      appCheckTtlMinutes: deps.config.ttlMinutes,
      apps: {
        recaptcha: deps.config.apps.recaptcha || null,
        cloudflare: deps.config.apps.cloudflare || null,
      },
      turnstileHostname: deps.config.turnstile.expectedHostname,
      turnstileAction: deps.config.turnstile.expectedAction,
    };
    return c.json(body);
  });

  app.route("/api/regular", regularRoute(deps));
  app.route("/api/sensitive", sensitiveRoute(deps));
  app.route("/api/diag", diagRoute(deps));
  app.route("/app-check/exchange", exchangeRoute(deps));

  return app;
}
