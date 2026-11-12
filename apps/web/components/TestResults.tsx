import type { ScenarioResult } from "@/lib/scenarios";

const STYLES = { pass: "text-green-700", fail: "text-red-700", info: "text-blue-700" };
const LABELS = { pass: "PASS", fail: "FAIL", info: "INFO" };

interface Props {
  results: ScenarioResult[];
  busy: boolean;
  disabled: boolean;
  onRun: () => void;
}

export function TestResults({ results, busy, disabled, onRun }: Props) {
  return (
    <section className="rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Live integration checks</h3>
        <button
          className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={disabled || busy}
          onClick={onRun}
        >
          {busy ? "Running..." : "Run checks"}
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Runs against the real Firebase and backend. Expired-token rejection is covered by the mocked API unit tests.
      </p>
      <ul className="mt-3 space-y-1 text-sm">
        {results.map((result) => (
          <li key={result.id} className="flex gap-3">
            <span className={`w-10 font-mono text-xs font-semibold ${STYLES[result.status]}`}>{LABELS[result.status]}</span>
            <span className="flex-1">{result.label}</span>
            <span className="text-xs text-slate-500">{result.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
