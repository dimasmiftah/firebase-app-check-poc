import { decodeJwtPayload } from "@/lib/jwt";
import type { TokenSnapshot } from "@/lib/useProvider";

function formatTime(seconds?: number) {
  return seconds ? new Date(seconds * 1000).toLocaleString() : "-";
}

function formatRemaining(ms: number) {
  if (ms <= 0) return "expired";
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
}

export function TokenInspector({ title, snapshot, now }: { title: string; snapshot: TokenSnapshot | null; now: number }) {
  const claims = snapshot ? decodeJwtPayload(snapshot.token) : null;

  return (
    <section className="rounded-lg border bg-white p-4">
      <h3 className="font-medium">{title}</h3>
      {!snapshot ? (
        <p className="mt-2 text-sm text-slate-500">No token yet.</p>
      ) : (
        <dl className="mt-3 grid grid-cols-[150px_1fr] gap-y-1 text-sm">
          <dt className="text-slate-500">Token preview</dt>
          <dd className="break-all font-mono text-xs">{`${snapshot.token.slice(0, 24)}...${snapshot.token.slice(-10)}`}</dd>
          <dt className="text-slate-500">Issued at (iat)</dt>
          <dd>{formatTime(claims?.iat)}</dd>
          <dt className="text-slate-500">Expiration (exp)</dt>
          <dd>{formatTime(claims?.exp)}</dd>
          <dt className="text-slate-500">Remaining TTL</dt>
          <dd>{claims?.exp ? formatRemaining(claims.exp * 1000 - now) : "-"}</dd>
          <dt className="text-slate-500">App ID (sub)</dt>
          <dd className="break-all">{claims?.sub ?? "-"}</dd>
          <dt className="text-slate-500">Request duration</dt>
          <dd>{snapshot.durationMs.toFixed(1)} ms</dd>
          <dt className="text-slate-500">Same as previous</dt>
          <dd>{snapshot.sameAsPrevious === null ? "n/a" : snapshot.sameAsPrevious ? "yes (cached)" : "no (new token)"}</dd>
        </dl>
      )}
      <p className="mt-3 text-xs text-slate-400">Decoded locally for inspection only. This is not verification.</p>
    </section>
  );
}
