export type Provider = "recaptcha" | "cloudflare";

export type TokenType = "none" | "regular" | "limited-use" | "invalid" | "replayed";

export interface ApiConfig {
  appCheckReady: boolean;
  exchangeReady: boolean;
  missing: { firebase: string[]; apps: string[]; turnstile: string[] };
  appCheckTtlMinutes: number;
  apps: Record<Provider, string | null>;
  turnstileHostname: string;
  turnstileAction: string | null;
}

export interface ApiSuccess {
  success: true;
  message: string;
  appId?: string;
  provider?: Provider;
  verifyMs?: number;
}

export interface ApiError {
  success: false;
  error: string;
  message: string;
  missing?: string[];
  errorCodes?: string[];
}

export type ApiResponse = ApiSuccess | ApiError;

export interface ExchangeRequest {
  turnstileToken: string;
}

export interface ExchangeSuccess {
  success: true;
  token: string;
  ttlMillis: number;
  expireTimeMillis: number;
}

export type ExchangeResponse = ExchangeSuccess | ApiError;

export interface RequestRecord {
  id: string;
  timestamp: number;
  provider: Provider;
  endpoint: string;
  method: string;
  tokenType: TokenType;
  status: number;
  latencyMs: number;
  verifyMs?: number;
  ok: boolean;
  result: string;
}

export interface LatencyStats {
  samples: number;
  avg: number;
  median: number;
  p95: number;
  stdDev?: number;
}

export type BenchmarkMetric =
  | "initialAttestation"
  | "cachedToken"
  | "forcedRefresh"
  | "limitedUseToken"
  | "regularRoundTrip"
  | "regularVerify"
  | "sensitiveRoundTrip"
  | "sensitiveVerify";

export interface FailureObservation {
  label: string;
  status: number | null;
  latencyMs: number;
  detail: string;
}

export interface BenchmarkResult {
  provider: Provider;
  ranAt: number;
  sampleCount: number;
  metrics: Partial<Record<BenchmarkMetric, LatencyStats>>;
  failures: FailureObservation[];
}
