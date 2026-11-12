"use client";

import { useEffect, useState } from "react";
import type { BenchmarkMetric, BenchmarkResult, Provider } from "@poc/shared";
import { BENCHMARK_STORAGE_KEY } from "@/lib/benchmark";
import { PROVIDERS } from "@/lib/providers";

const ROWS: { metric: BenchmarkMetric; label: string; side: "frontend" | "backend" }[] = [
  { metric: "initialAttestation", label: "Initial attestation", side: "frontend" },
  { metric: "cachedToken", label: "Cached token retrieval", side: "frontend" },
  { metric: "forcedRefresh", label: "Forced refresh", side: "frontend" },
  { metric: "limitedUseToken", label: "Limited-use token", side: "frontend" },
  { metric: "regularRoundTrip", label: "Regular API round trip", side: "frontend" },
  { metric: "regularVerify", label: "Regular verifyToken()", side: "backend" },
  { metric: "sensitiveRoundTrip", label: "Replay-protected round trip", side: "frontend" },
  { metric: "sensitiveVerify", label: "Replay-protected verifyToken(consume)", side: "backend" },
];

const fmt = (value?: number) => (value === undefined ? "-" : `${value.toFixed(1)}`);

export function BenchmarkTable({ results }: { results: Partial<Record<Provider, BenchmarkResult | null>> }) {
  const providers = Object.keys(results) as Provider[];

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="p-2">Metric (ms)</th>
              <th className="p-2">Measured at</th>
              {providers.map((provider) => (
                <th key={provider} className="p-2">
                  {PROVIDERS[provider].name} <span className="font-normal">avg / median / p95</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.metric} className="border-t">
                <td className="p-2">{row.label}</td>
                <td className="p-2 text-slate-500">{row.side}</td>
                {providers.map((provider) => {
                  const stats = results[provider]?.metrics[row.metric];
                  return (
                    <td key={provider} className="p-2 font-mono text-xs">
                      {stats ? `${fmt(stats.avg)} / ${fmt(stats.median)} / ${fmt(stats.p95)} (n=${stats.samples})` : "-"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {providers.map((provider) => (
        <div key={provider} className="rounded-lg border bg-white p-4 text-sm">
          <h4 className="font-medium">{PROVIDERS[provider].name}: failed attestation</h4>
          {results[provider]?.failures.length ? (
            <ul className="mt-2 space-y-1">
              {results[provider]?.failures.map((failure) => (
                <li key={failure.label}>
                  {failure.label}: {failure.status ?? "n/a"}
                  {failure.latencyMs ? ` in ${failure.latencyMs.toFixed(0)} ms` : ""} {failure.detail}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-slate-500">No run yet.</p>
          )}
        </div>
      ))}
    </div>
  );
}

interface RunnerProps {
  provider: Provider;
  result: BenchmarkResult | null;
  busy: boolean;
  disabled: boolean;
  progress: string;
  onRun: (sampleCount: number) => void;
}

export function BenchmarkRunner({ provider, result, busy, disabled, progress, onRun }: RunnerProps) {
  const [samples, setSamples] = useState(5);

  return (
    <section className="space-y-3 rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Benchmark</h3>
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="samples">Samples</label>
          <input
            id="samples"
            type="number"
            min={3}
            max={50}
            value={samples}
            onChange={(event) => setSamples(Number(event.target.value))}
            className="w-16 rounded border px-2 py-1"
          />
          <button
            className="rounded bg-slate-900 px-3 py-1.5 text-white disabled:opacity-50"
            disabled={disabled || busy}
            onClick={() => onRun(samples)}
          >
            {busy ? progress || "Running..." : "Run benchmark"}
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Cloudflare initial attestation and forced refresh include the Turnstile run plus the exchange round trip.
      </p>
      <BenchmarkTable results={{ [provider]: result }} />
    </section>
  );
}

export function BenchmarkComparison() {
  const [results, setResults] = useState<Record<Provider, BenchmarkResult | null>>({ recaptcha: null, cloudflare: null });

  useEffect(() => {
    const read = (provider: Provider) => {
      const stored = localStorage.getItem(BENCHMARK_STORAGE_KEY(provider));
      return stored ? (JSON.parse(stored) as BenchmarkResult) : null;
    };
    const timer = setTimeout(() => setResults({ recaptcha: read("recaptcha"), cloudflare: read("cloudflare") }), 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Benchmark comparison</h1>
      <p className="text-sm text-slate-600">
        Results are measured in this browser and stored in localStorage. Run the benchmark from each provider dashboard.
      </p>
      <BenchmarkTable results={results} />
    </div>
  );
}
