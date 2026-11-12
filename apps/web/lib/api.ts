import type { ApiConfig, ApiResponse, ExchangeResponse } from "@poc/shared";
import { clientEnv } from "./env";

export type Endpoint = "public" | "regular" | "sensitive";

const ENDPOINTS: Record<Endpoint, { path: string; method: "GET" | "POST" }> = {
  public: { path: "/api/public", method: "GET" },
  regular: { path: "/api/regular", method: "GET" },
  sensitive: { path: "/api/sensitive", method: "POST" },
};

export interface ApiCallResult<T = ApiResponse> {
  status: number;
  body: T | null;
  latencyMs: number;
}

async function send<T>(path: string, init: RequestInit): Promise<ApiCallResult<T>> {
  const startedAt = performance.now();
  const response = await fetch(`${clientEnv.apiUrl}${path}`, init);
  const body = (await response.json().catch(() => null)) as T | null;
  return { status: response.status, body, latencyMs: performance.now() - startedAt };
}

export function callEndpoint(endpoint: Endpoint, token?: string) {
  const { path, method } = ENDPOINTS[endpoint];
  return send<ApiResponse>(path, {
    method,
    headers: token ? { "X-Firebase-AppCheck": token } : {},
  });
}

export function fetchApiConfig() {
  return send<ApiConfig>("/api/config", {});
}

export function exchangeTurnstileToken(turnstileToken: string) {
  return send<ExchangeResponse>("/app-check/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ turnstileToken }),
  });
}
