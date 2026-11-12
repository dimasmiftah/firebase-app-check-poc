import { CustomProvider } from "firebase/app-check";
import { exchangeTurnstileToken } from "./api";
import { clientEnv } from "./env";

interface TurnstileRenderParams {
  sitekey: string;
  action?: string;
  execution: "execute";
  appearance: "interaction-only";
  callback: (token: string) => void;
  "error-callback": (code?: string) => void;
  "expired-callback": () => void;
  "timeout-callback": () => void;
}

interface TurnstileApi {
  render(container: HTMLElement, params: TurnstileRenderParams): string;
  execute(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TURNSTILE_TIMEOUT_MS = 60_000;

export const cloudflareTimings = { turnstileMs: 0, exchangeMs: 0 };

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile API unavailable")));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Failed to load the Cloudflare Turnstile script"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

async function getTurnstileToken() {
  const turnstile = await loadTurnstile();
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:50";
  document.body.appendChild(container);

  return new Promise<string>((resolve, reject) => {
    let widgetId = "";
    const finish = (settle: () => void) => {
      clearTimeout(timer);
      if (widgetId) turnstile.remove(widgetId);
      container.remove();
      settle();
    };
    const timer = setTimeout(
      () => finish(() => reject(new Error("Turnstile timed out"))),
      TURNSTILE_TIMEOUT_MS,
    );
    widgetId = turnstile.render(container, {
      sitekey: clientEnv.cloudflare.siteKey,
      action: clientEnv.cloudflare.action || undefined,
      execution: "execute",
      appearance: "interaction-only",
      callback: (token) => finish(() => resolve(token)),
      "error-callback": (code) => finish(() => reject(new Error(`Turnstile error ${code ?? ""}`.trim()))),
      "expired-callback": () => finish(() => reject(new Error("Turnstile token expired"))),
      "timeout-callback": () => finish(() => reject(new Error("Turnstile interaction timed out"))),
    });
    turnstile.execute(widgetId);
  });
}

async function getAppCheckToken() {
  const turnstileStartedAt = performance.now();
  const turnstileToken = await getTurnstileToken();
  cloudflareTimings.turnstileMs = performance.now() - turnstileStartedAt;

  const exchange = await exchangeTurnstileToken(turnstileToken);
  cloudflareTimings.exchangeMs = exchange.latencyMs;
  if (!exchange.body || !exchange.body.success) {
    throw new Error(exchange.body ? `${exchange.body.error}: ${exchange.body.message}` : `Exchange failed (${exchange.status})`);
  }
  return { token: exchange.body.token, expireTimeMillis: exchange.body.expireTimeMillis };
}

export function createCloudflareProvider() {
  return new CustomProvider({ getToken: getAppCheckToken });
}
