"use client";

import { useState } from "react";
import type { RequestRecord, TokenType } from "@poc/shared";
import type { Endpoint } from "@/lib/api";

interface Props {
  busy: string | null;
  hasReplayToken: boolean;
  history: RequestRecord[];
  onSend: (endpoint: Endpoint, tokenType: TokenType) => void;
  onClear: () => void;
}

export function RequestTester({ busy, hasReplayToken, history, onSend, onClear }: Props) {
  const [target, setTarget] = useState<Endpoint>("regular");

  const button = "rounded border bg-white px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50";

  return (
    <section className="rounded-lg border bg-white p-4">
      <h3 className="font-medium">API operations</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={button} disabled={!!busy} onClick={() => onSend("public", "none")}>
          Public API
        </button>
        <button className={button} disabled={!!busy} onClick={() => onSend("regular", "regular")}>
          Regular API
        </button>
        <button className={button} disabled={!!busy} onClick={() => onSend("sensitive", "limited-use")}>
          Sensitive API
        </button>
        <button className={button} disabled={!!busy || !hasReplayToken} onClick={() => onSend("sensitive", "replayed")}>
          Replay previous token
        </button>
        <span className="flex items-center gap-2 text-sm text-slate-500">
          target
          <select
            className="rounded border px-2 py-1"
            value={target}
            onChange={(event) => setTarget(event.target.value as Endpoint)}
          >
            <option value="regular">/api/regular</option>
            <option value="sensitive">/api/sensitive</option>
          </select>
        </span>
        <button className={button} disabled={!!busy} onClick={() => onSend(target, "none")}>
          Without token
        </button>
        <button className={button} disabled={!!busy} onClick={() => onSend(target, "invalid")}>
          Invalid token
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <h4 className="text-sm font-medium">Request history</h4>
        <button className="text-sm text-blue-700 disabled:opacity-50" disabled={history.length === 0} onClick={onClear}>
          Clear
        </button>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-slate-500">
            <tr>
              <th className="py-1 pr-3">Time</th>
              <th className="pr-3">Provider</th>
              <th className="pr-3">Endpoint</th>
              <th className="pr-3">Token type</th>
              <th className="pr-3">Status</th>
              <th className="pr-3">Latency</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {history.map((record) => (
              <tr key={record.id} className="border-t">
                <td className="py-1 pr-3">{new Date(record.timestamp).toLocaleTimeString()}</td>
                <td className="pr-3">{record.provider}</td>
                <td className="pr-3">
                  {record.method} /api/{record.endpoint}
                </td>
                <td className="pr-3">{record.tokenType}</td>
                <td className={`pr-3 font-medium ${record.ok ? "text-green-700" : "text-red-700"}`}>{record.status}</td>
                <td className="pr-3">
                  {record.latencyMs.toFixed(0)} ms
                  {record.verifyMs !== undefined ? ` (verify ${record.verifyMs.toFixed(0)} ms)` : ""}
                </td>
                <td>{record.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {history.length === 0 && <p className="py-2 text-sm text-slate-500">No requests yet.</p>}
      </div>
    </section>
  );
}
