import type { AppCheck } from "firebase/app-check";
import type { BenchmarkMetric, BenchmarkResult, FailureObservation, Provider } from "@poc/shared";
import { callEndpoint, exchangeTurnstileToken } from "./api";
import { createDisposableAppCheck } from "./firebase";
import { requestToken } from "./provider-client";
import { computeStats } from "./stats";

export const BENCHMARK_STORAGE_KEY = (provider: Provider) => `poc-benchmark-${provider}`;

export async function runBenchmark(
  provider: Provider,
  appCheck: AppCheck,
  sampleCount: number,
  onProgress: (message: string) => void,
): Promise<BenchmarkResult> {
  const samples: Record<BenchmarkMetric, number[]> = {
    initialAttestation: [],
    cachedToken: [],
    forcedRefresh: [],
    limitedUseToken: [],
    regularRoundTrip: [],
    regularVerify: [],
    sensitiveRoundTrip: [],
    sensitiveVerify: [],
  };
  const range = Array.from({ length: sampleCount }, (_, i) => i);

  for (const i of range) {
    onProgress(`Initial attestation ${i + 1}/${sampleCount}`);
    const disposable = createDisposableAppCheck(provider, `bench-${provider}-${Date.now()}-${i}`);
    try {
      samples.initialAttestation.push((await requestToken(disposable.appCheck, "regular")).durationMs);
    } finally {
      await disposable.dispose();
    }
  }

  await requestToken(appCheck, "regular");
  for (const i of range) {
    onProgress(`Cached token ${i + 1}/${sampleCount}`);
    samples.cachedToken.push((await requestToken(appCheck, "regular")).durationMs);
  }

  for (const i of range) {
    onProgress(`Forced refresh ${i + 1}/${sampleCount}`);
    samples.forcedRefresh.push((await requestToken(appCheck, "forced")).durationMs);
  }

  for (const i of range) {
    onProgress(`Limited-use token ${i + 1}/${sampleCount}`);
    samples.limitedUseToken.push((await requestToken(appCheck, "limited-use")).durationMs);
  }

  const regular = await requestToken(appCheck, "regular");
  for (const i of range) {
    onProgress(`Regular API verification ${i + 1}/${sampleCount}`);
    const result = await callEndpoint("regular", regular.token);
    samples.regularRoundTrip.push(result.latencyMs);
    if (result.body?.success && result.body.verifyMs !== undefined) samples.regularVerify.push(result.body.verifyMs);
  }

  for (const i of range) {
    onProgress(`Replay-protected verification ${i + 1}/${sampleCount}`);
    const limited = await requestToken(appCheck, "limited-use");
    const result = await callEndpoint("sensitive", limited.token);
    samples.sensitiveRoundTrip.push(result.latencyMs);
    if (result.body?.success && result.body.verifyMs !== undefined) samples.sensitiveVerify.push(result.body.verifyMs);
  }

  onProgress("Observing failed attestation");
  const failures: FailureObservation[] = [];
  const invalid = await callEndpoint("regular", "invalid.token.value");
  failures.push({
    label: "Invalid App Check token on /api/regular",
    status: invalid.status,
    latencyMs: invalid.latencyMs,
    detail: invalid.body && !invalid.body.success ? invalid.body.error : "",
  });
  const spent = await requestToken(appCheck, "limited-use");
  await callEndpoint("sensitive", spent.token);
  const replay = await callEndpoint("sensitive", spent.token);
  failures.push({
    label: "Replayed limited-use token on /api/sensitive",
    status: replay.status,
    latencyMs: replay.latencyMs,
    detail: replay.body && !replay.body.success ? replay.body.error : "",
  });
  if (provider === "cloudflare") {
    const bogus = await exchangeTurnstileToken("invalid-turnstile-token");
    failures.push({
      label: "Invalid Turnstile token on /app-check/exchange",
      status: bogus.status,
      latencyMs: bogus.latencyMs,
      detail: bogus.body && !bogus.body.success ? bogus.body.error : "",
    });
  } else {
    failures.push({
      label: "reCAPTCHA failed attestation",
      status: null,
      latencyMs: 0,
      detail: "Not scriptable: Firebase rejects low-score or invalid reCAPTCHA tokens inside its own exchange. Observe manually by lowering the key's threshold or blocking the reCAPTCHA domain.",
    });
  }

  const metrics: BenchmarkResult["metrics"] = {};
  for (const key of Object.keys(samples) as BenchmarkMetric[]) {
    if (samples[key].length > 0) metrics[key] = computeStats(samples[key]);
  }
  return { provider, ranAt: Date.now(), sampleCount, metrics, failures };
}
