"use client";

import { useEffect, useRef, useState } from "react";
import { onTokenChanged, type AppCheck } from "firebase/app-check";
import type { ApiConfig, BenchmarkResult, Provider, RequestRecord, TokenType } from "@poc/shared";
import { callEndpoint, fetchApiConfig, type Endpoint } from "./api";
import { BENCHMARK_STORAGE_KEY, runBenchmark } from "./benchmark";
import { missingEnv, providerAppId } from "./env";
import { getAppCheckFor } from "./firebase";
import { decodeJwtPayload } from "./jwt";
import { requestToken, type TokenKind } from "./provider-client";
import { runScenarios, type ScenarioResult } from "./scenarios";

export interface TokenSnapshot {
  kind: TokenKind;
  token: string;
  durationMs: number;
  sameAsPrevious: boolean | null;
  receivedAt: number;
}

export interface TokenChange {
  at: number;
  preview: string;
  expiresAt: number | null;
}

const INVALID_TOKEN = "invalid.token.value";

export function useProvider(provider: Provider) {
  const [appCheck, setAppCheck] = useState<AppCheck | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<TokenSnapshot | null>(null);
  const [limited, setLimited] = useState<TokenSnapshot | null>(null);
  const [changes, setChanges] = useState<TokenChange[]>([]);
  const [history, setHistory] = useState<RequestRecord[]>([]);
  const [lastSensitiveToken, setLastSensitiveToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioResult[]>([]);
  const [benchmark, setBenchmark] = useState<BenchmarkResult | null>(null);
  const [progress, setProgress] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const missing = missingEnv(provider);
  const configError =
    missing.length > 0
      ? `Missing frontend environment variables: ${missing.join(", ")} (see apps/web/.env.example)`
      : initError;
  const previousToken = useRef<string | null>(null);
  const lastListenerToken = useRef<string | null>(null);

  const guard = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const requireAppCheck = () => {
    if (!appCheck) throw new Error("App Check is not initialized");
    return appCheck;
  };

  const fetchToken = (kind: TokenKind) =>
    guard(`token:${kind}`, async () => {
      const { token, durationMs } = await requestToken(requireAppCheck(), kind);
      const entry: TokenSnapshot = { kind, token, durationMs, sameAsPrevious: null, receivedAt: Date.now() };
      if (kind === "limited-use") {
        setLimited(entry);
        return;
      }
      entry.sameAsPrevious = previousToken.current === null ? null : previousToken.current === token;
      previousToken.current = token;
      setSnapshot(entry);
    });

  const resolveToken = async (tokenType: TokenType) => {
    if (tokenType === "none") return undefined;
    if (tokenType === "invalid") return INVALID_TOKEN;
    if (tokenType === "replayed") {
      if (!lastSensitiveToken) throw new Error("No previous limited-use token to replay yet");
      return lastSensitiveToken;
    }
    const kind: TokenKind = tokenType === "limited-use" ? "limited-use" : "regular";
    return (await requestToken(requireAppCheck(), kind)).token;
  };

  const sendRequest = (endpoint: Endpoint, tokenType: TokenType) =>
    guard(`request:${endpoint}`, async () => {
      const token = await resolveToken(tokenType);
      if (token && endpoint === "sensitive" && tokenType === "limited-use") setLastSensitiveToken(token);
      const { status, body, latencyMs } = await callEndpoint(endpoint, token);
      const record: RequestRecord = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        provider,
        endpoint,
        method: endpoint === "sensitive" ? "POST" : "GET",
        tokenType,
        status,
        latencyMs,
        verifyMs: body?.success ? body.verifyMs : undefined,
        ok: status >= 200 && status < 300,
        result: body ? (body.success ? body.message : body.error) : "no body",
      };
      setHistory((current) => [record, ...current]);
    });

  const clearHistory = () => setHistory([]);

  const startScenarios = () =>
    guard("scenarios", async () => {
      setScenarios([]);
      await runScenarios(provider, requireAppCheck(), providerAppId(provider), (result) =>
        setScenarios((current) => [...current, result]),
      );
    });

  const startBenchmark = (sampleCount: number) =>
    guard("benchmark", async () => {
      const result = await runBenchmark(provider, requireAppCheck(), sampleCount, setProgress);
      localStorage.setItem(BENCHMARK_STORAGE_KEY(provider), JSON.stringify(result));
      setBenchmark(result);
      setProgress("");
    });

  useEffect(() => {
    if (missingEnv(provider).length > 0) return;
    const timer = setTimeout(() => {
      try {
        setAppCheck(getAppCheckFor(provider));
      } catch (cause) {
        setInitError(cause instanceof Error ? cause.message : String(cause));
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [provider]);

  useEffect(() => {
    fetchApiConfig()
      .then(({ body }) => setApiConfig(body))
      .catch(() => setApiError("API unreachable. Start it with `bun dev` and check NEXT_PUBLIC_API_URL."));
    const timer = setTimeout(() => {
      const stored = localStorage.getItem(BENCHMARK_STORAGE_KEY(provider));
      if (stored) setBenchmark(JSON.parse(stored) as BenchmarkResult);
    }, 0);
    return () => clearTimeout(timer);
  }, [provider]);

  useEffect(() => {
    if (!appCheck) return;
    return onTokenChanged(appCheck, (result) => {
      if (!result.token || lastListenerToken.current === result.token) return;
      lastListenerToken.current = result.token;
      const exp = decodeJwtPayload(result.token)?.exp;
      setChanges((current) => [
        { at: Date.now(), preview: `${result.token.slice(0, 16)}...${result.token.slice(-8)}`, expiresAt: exp ? exp * 1000 : null },
        ...current,
      ]);
    });
  }, [appCheck]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  return {
    ready: appCheck !== null,
    configError,
    apiConfig,
    apiError,
    snapshot,
    limited,
    changes,
    history,
    busy,
    error,
    scenarios,
    benchmark,
    progress,
    now,
    hasReplayToken: lastSensitiveToken !== null,
    fetchToken,
    sendRequest,
    clearHistory,
    startScenarios,
    startBenchmark,
  };
}
