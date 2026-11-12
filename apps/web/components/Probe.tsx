"use client";

import { useEffect, useState } from "react";
import type { Provider } from "@poc/shared";
import { callEndpoint } from "@/lib/api";
import { clientEnv, missingEnv } from "@/lib/env";
import { getAppCheckFor } from "@/lib/firebase";
import { requestToken } from "@/lib/provider-client";

interface CallResult {
  status: number | null;
  detail: string;
}

export interface ProbeResult {
  provider: Provider;
  startedAt: string;
  signals: { webdriver: boolean; userAgent: string; plugins: number; languages: string[] };
  score: {
    ok: boolean;
    score: number | null;
    reasons: string[];
    valid: boolean | null;
    invalidReason: string | null;
    error: string | null;
  } | null;
  attestation: { ok: boolean; durationMs: number; error: string | null };
  regular: CallResult | null;
  sensitive: CallResult | null;
  replay: CallResult | null;
}

declare global {
  interface Window {
    grecaptcha?: { enterprise: { ready(cb: () => void): void; execute(key: string, opts: { action: string }): Promise<string> } };
    __probe?: ProbeResult;
    __tokenSource?: { regular(): Promise<string>; limited(): Promise<string> };
  }
}

const RECAPTCHA_ACTION = "probe";

function loadRecaptcha(siteKey: string) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/enterprise.js?render=${encodeURIComponent(siteKey)}`;
    script.async = true;
    script.onload = () => window.grecaptcha?.enterprise.ready(resolve);
    script.onerror = () => reject(new Error("Failed to load reCAPTCHA Enterprise script"));
    document.head.appendChild(script);
  });
}

async function readScore(): Promise<ProbeResult["score"]> {
  const empty = { ok: false, score: null, reasons: [], valid: null, invalidReason: null };
  try {
    const siteKey = clientEnv.recaptcha.siteKey;
    await loadRecaptcha(siteKey);
    const token = await window.grecaptcha!.enterprise.execute(siteKey, { action: RECAPTCHA_ACTION });
    const response = await fetch(`${clientEnv.apiUrl}/api/diag/recaptcha-score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, siteKey, expectedAction: RECAPTCHA_ACTION }),
    });
    const body = await response.json();
    if (!body.success) return { ...empty, error: body.message ?? "assessment failed" };
    return { ok: true, score: body.score, reasons: body.reasons, valid: body.valid, invalidReason: body.invalidReason, error: null };
  } catch (cause) {
    return { ...empty, error: cause instanceof Error ? cause.message : String(cause) };
  }
}

async function call(endpoint: "regular" | "sensitive", token: string): Promise<CallResult> {
  const { status, body } = await callEndpoint(endpoint, token);
  return { status, detail: body ? (body.success ? body.message : body.error) : "no body" };
}

async function runProbe(provider: Provider): Promise<ProbeResult> {
  const result: ProbeResult = {
    provider,
    startedAt: new Date().toISOString(),
    signals: {
      webdriver: navigator.webdriver === true,
      userAgent: navigator.userAgent,
      plugins: navigator.plugins.length,
      languages: [...navigator.languages],
    },
    score: null,
    attestation: { ok: false, durationMs: 0, error: null },
    regular: null,
    sensitive: null,
    replay: null,
  };

  if (provider === "recaptcha") result.score = await readScore();

  const appCheck = getAppCheckFor(provider);
  let stage = "regular token";
  try {
    const { token, durationMs } = await requestToken(appCheck, "regular");
    result.attestation = { ok: true, durationMs, error: null };
    result.regular = await call("regular", token);
    stage = "limited-use token";
    const limited = await requestToken(appCheck, "limited-use");
    result.sensitive = await call("sensitive", limited.token);
    result.replay = await call("sensitive", limited.token);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    result.attestation = { ok: false, durationMs: 0, error: `[${stage}] ${message}` };
  }
  return result;
}

export function Probe({ provider }: { provider: Provider }) {
  const [result, setResult] = useState<ProbeResult | null>(null);
  const missing = missingEnv(provider);

  useEffect(() => {
    if (missingEnv(provider).length > 0) return;
    let cancelled = false;
    runProbe(provider).then((value) => {
      const appCheck = getAppCheckFor(provider);
      window.__tokenSource = {
        regular: async () => (await requestToken(appCheck, "regular")).token,
        limited: async () => (await requestToken(appCheck, "limited-use")).token,
      };
      window.__probe = value;
      if (!cancelled) setResult(value);
    });
    return () => {
      cancelled = true;
    };
  }, [provider]);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-2 text-xl font-semibold">Probe: {provider}</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Runs attestation, optional reCAPTCHA score assessment, and the regular, sensitive and replay calls once.
      </p>
      {missing.length > 0 ? (
        <p className="text-red-600">Missing: {missing.join(", ")}</p>
      ) : (
        <pre id="probe-result" className="overflow-auto rounded bg-neutral-100 p-4 text-xs dark:bg-neutral-900">
          {result ? JSON.stringify(result, null, 2) : "running..."}
        </pre>
      )}
    </main>
  );
}
