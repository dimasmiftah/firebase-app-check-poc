"use client";

import type { Provider } from "@poc/shared";
import { decodeJwtPayload } from "@/lib/jwt";
import { PROVIDERS } from "@/lib/providers";
import { providerAppId } from "@/lib/env";
import { useProvider } from "@/lib/useProvider";
import { BenchmarkRunner } from "./Benchmark";
import { RequestTester } from "./RequestTester";
import { TestResults } from "./TestResults";
import { TokenInspector } from "./TokenInspector";

function Banner({ tone, children }: { tone: "error" | "warn"; children: React.ReactNode }) {
  const style = tone === "error" ? "border-red-300 bg-red-50 text-red-800" : "border-amber-300 bg-amber-50 text-amber-900";
  return <div className={`rounded border p-3 text-sm ${style}`}>{children}</div>;
}

export function ProviderDashboard({ provider }: { provider: Provider }) {
  const info = PROVIDERS[provider];
  const session = useProvider(provider);
  const { snapshot, limited, apiConfig, now } = session;

  const claims = snapshot ? decodeJwtPayload(snapshot.token) : null;
  const observedTtlMinutes = claims?.exp && claims.iat ? (claims.exp - claims.iat) / 60 : null;
  const status = !claims?.exp ? "no token" : claims.exp * 1000 > now ? "valid" : "expired";
  const configuredTtl =
    provider === "cloudflare" && apiConfig
      ? `${apiConfig.appCheckTtlMinutes} min (explicit createToken ttlMillis)`
      : observedTtlMinutes
        ? `${observedTtlMinutes.toFixed(0)} min observed (set in Firebase Console)`
        : "Set in Firebase Console; visible after first token";

  const copy = (token?: string) => token && navigator.clipboard.writeText(token);
  const missingApi = apiConfig && !apiConfig.appCheckReady ? [...apiConfig.missing.firebase, ...apiConfig.missing.apps] : [];
  const missingExchange =
    provider === "cloudflare" && apiConfig && !apiConfig.exchangeReady ? apiConfig.missing.turnstile : [];

  const button = "rounded border bg-white px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50";
  const disabled = !session.ready || !!session.busy;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase text-slate-500">{info.option}</p>
        <h1 className="text-2xl font-semibold">{info.name}</h1>
      </div>

      {session.configError && <Banner tone="error">{session.configError}</Banner>}
      {session.apiError && <Banner tone="error">{session.apiError}</Banner>}
      {missingApi.length > 0 && <Banner tone="warn">API is missing: {missingApi.join(", ")} (see apps/api/.env.example)</Banner>}
      {missingExchange.length > 0 && <Banner tone="warn">API is missing: {missingExchange.join(", ")}</Banner>}
      {session.error && <Banner tone="error">{session.error}</Banner>}

      <section className="rounded-lg border bg-white p-4">
        <h3 className="font-medium">Provider information</h3>
        <dl className="mt-3 grid grid-cols-[170px_1fr] gap-y-1 text-sm">
          <dt className="text-slate-500">Provider</dt>
          <dd>{info.name}</dd>
          <dt className="text-slate-500">Firebase App ID</dt>
          <dd className="break-all">{providerAppId(provider) || "not configured"}</dd>
          <dt className="text-slate-500">Attestation method</dt>
          <dd>{info.attestation}</dd>
          <dt className="text-slate-500">Token TTL</dt>
          <dd>{configuredTtl}</dd>
          <dt className="text-slate-500">Token status</dt>
          <dd>{status}</dd>
        </dl>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h3 className="font-medium">Token operations</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={button} disabled={disabled} onClick={() => session.fetchToken("regular")}>
            Get token
          </button>
          <button className={button} disabled={disabled} onClick={() => session.fetchToken("forced")}>
            Force refresh
          </button>
          <button className={button} disabled={disabled} onClick={() => session.fetchToken("limited-use")}>
            Get limited-use token
          </button>
          <button className={button} disabled={!snapshot} onClick={() => copy(snapshot?.token)}>
            Copy token
          </button>
          <button className={button} disabled={!limited} onClick={() => copy(limited?.token)}>
            Copy limited-use token
          </button>
        </div>
        {session.busy?.startsWith("token") && <p className="mt-2 text-sm text-slate-500">Requesting token...</p>}
        {snapshot?.kind === "forced" && snapshot.sameAsPrevious !== null && (
          <p className="mt-2 text-sm">{snapshot.sameAsPrevious ? "No new token was issued." : "A new token was issued."}</p>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <TokenInspector title="Token inspector" snapshot={snapshot} now={now} />
        <TokenInspector title="Limited-use token" snapshot={limited} now={now} />
      </div>

      <section className="rounded-lg border bg-white p-4">
        <h3 className="font-medium">Automatic refresh log</h3>
        <p className="mt-1 text-xs text-slate-500">
          The SDK schedules a refresh at roughly half of the token TTL, subject to SDK behavior and timing. Leave this page open
          and watch for token changes; nothing here assumes an exact refresh timestamp.
        </p>
        <ul className="mt-2 space-y-1 text-sm">
          {session.changes.map((change) => (
            <li key={change.at} className="font-mono text-xs">
              {new Date(change.at).toLocaleTimeString()} token changed {change.preview}
              {change.expiresAt ? ` (exp ${new Date(change.expiresAt).toLocaleTimeString()})` : ""}
            </li>
          ))}
        </ul>
        {session.changes.length === 0 && <p className="mt-2 text-sm text-slate-500">No token changes observed yet.</p>}
      </section>

      <RequestTester
        busy={session.busy}
        hasReplayToken={session.hasReplayToken}
        history={session.history}
        onSend={session.sendRequest}
        onClear={session.clearHistory}
      />
      <TestResults
        results={session.scenarios}
        busy={session.busy === "scenarios"}
        disabled={disabled}
        onRun={session.startScenarios}
      />
      <BenchmarkRunner
        provider={provider}
        result={session.benchmark}
        busy={session.busy === "benchmark"}
        disabled={disabled}
        progress={session.progress}
        onRun={session.startBenchmark}
      />
    </div>
  );
}
