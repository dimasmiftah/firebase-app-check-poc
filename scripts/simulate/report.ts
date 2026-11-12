import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { ProbeResult } from "../../apps/web/components/Probe";
import { costSection, researchSection } from "./research-sections";

const OUT_DIR = "scripts/simulate/out";
const CACHED_TOKEN_MS = 5;

interface BrowserRow {
  kind: "browser";
  profile: string;
  description: string;
  provider: "recaptcha" | "cloudflare";
  run: number;
  note?: string;
  result: ProbeResult | { error: string };
}

interface ApiRow {
  kind: "api";
  group: string;
  name: string;
  expected: string;
  status: number | string;
  detail: string;
  ok?: boolean;
  observation?: boolean;
  provider?: "recaptcha" | "cloudflare";
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function latestRun() {
  const stamp = (name: string) => name.replace(/^[a-z]+-/, "");
  const files = readdirSync(OUT_DIR)
    .filter((name) => /^(run|prof)-.*\.json$/.test(name))
    .sort((x, y) => stamp(y).localeCompare(stamp(x)));
  if (files.length === 0) throw new Error("No run-*.json in scripts/simulate/out, run scripts/simulate/run.ts first");
  const runs = files.map((file) => JSON.parse(readFileSync(`${OUT_DIR}/${file}`, "utf8")) as { generatedAt: string; runs: number; rows: (BrowserRow | ApiRow)[] });

  const browserRows: BrowserRow[] = [];
  const seenProfiles = new Set<string>();
  const browserStamps = new Set<string>();
  for (const run of runs) {
    const rows = run.rows.filter((row): row is BrowserRow => row.kind === "browser");
    const fresh = [...new Set(rows.map((row) => row.profile))].filter((profile) => !seenProfiles.has(profile));
    for (const profile of fresh) {
      seenProfiles.add(profile);
      browserRows.push(...rows.filter((row) => row.profile === profile));
      browserStamps.add(run.generatedAt);
    }
  }
  const order = ["headless-plain", "headless-spoofed", "headed-automated", "headed-clean", "real-chrome-cdp"];
  const rank = (profile: string) => (order.includes(profile) ? order.indexOf(profile) : order.length);
  browserRows.sort((x, y) => rank(x.profile) - rank(y.profile));
  const apiRun = runs.find((run) => run.rows.some((row) => row.kind === "api"));
  const mainBrowserRun = runs.find((run) => run.rows.some((row) => row.kind === "browser"));
  return {
    generatedAt: `browser profiles ${[...browserStamps].sort().join(" and ")}, API cases ${apiRun?.generatedAt}`,
    runs: mainBrowserRun?.runs ?? 0,
    rows: [...browserRows, ...(apiRun?.rows.filter((row) => row.kind === "api") ?? [])],
  };
}

function humanRows() {
  return readdirSync(OUT_DIR)
    .filter((name) => name.startsWith("human-"))
    .sort()
    .map((name) => JSON.parse(readFileSync(`${OUT_DIR}/${name}`, "utf8")) as BrowserRow);
}

const isProbe = (result: BrowserRow["result"]): result is ProbeResult => !("error" in result);

function summarize(rows: BrowserRow[]) {
  const probes = rows.map((row) => row.result).filter(isProbe);
  const attested = probes.filter((probe) => probe.attestation.ok).length;
  const scores = probes.map((probe) => probe.score?.score).filter((score): score is number => typeof score === "number");
  const scoreErrors = [...new Set(probes.map((probe) => probe.score?.error).filter(Boolean))] as string[];
  const errors = [
    ...new Set(
      rows.flatMap((row) =>
        isProbe(row.result) ? (row.result.attestation.error ? [row.result.attestation.error] : []) : [row.result.error],
      ),
    ),
  ];
  const sensitiveOk = probes.filter((probe) => probe.sensitive?.status === 200).length;
  const replayBlocked = probes.filter((probe) => probe.sensitive?.status === 200 && probe.replay?.status === 409).length;
  return { total: rows.length, attested, scores, scoreErrors, errors, sensitiveOk, replayBlocked };
}

function scoreCell(provider: string, summary: ReturnType<typeof summarize>) {
  if (provider !== "recaptcha") return "n/a (Turnstile has no score)";
  if (summary.scores.length > 0) return summary.scores.map((score) => score.toFixed(1)).join(", ");
  return summary.scoreErrors.length > 0 ? "unavailable (see notes)" : "n/a";
}

function shorten(message: string) {
  return message.length > 140 ? `${message.slice(0, 140)}...` : message;
}

function footnotes() {
  const items: string[] = [];
  return {
    mark(note: string) {
      let index = items.indexOf(note);
      if (index === -1) index = items.push(note) - 1;
      return `<sup>${index + 1}</sup>`;
    },
    render() {
      return items.length > 0 ? `<ol class="small notes">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>` : "";
    },
  };
}

function browserSection(rows: BrowserRow[], title: string) {
  const notes = footnotes();
  const profiles = [...new Set(rows.map((row) => row.profile))];
  const body = profiles
    .map((profile) => {
      const profileRows = rows.filter((row) => row.profile === profile);
      const providers = [...new Set(profileRows.map((row) => row.provider))];
      return providers
        .map((provider, index) => {
          const group = profileRows.filter((row) => row.provider === provider);
          const summary = summarize(group);
          const verdict = summary.attested === summary.total ? "pass" : summary.attested === 0 ? "block" : "mixed";
          const profileCell =
            index === 0
              ? `<td rowspan="${providers.length}"><strong>${escapeHtml(profile)}</strong><br><span class="muted">${escapeHtml(profileRows[0].description)}</span></td>`
              : "";
          const calls =
            summary.sensitiveOk === 0
              ? "<span class=\"muted\">none</span>"
              : `sensitive ${summary.sensitiveOk}/${summary.total}<br>replay blocked ${summary.replayBlocked}/${summary.sensitiveOk}`;
          const score = provider === "recaptcha" ? scoreCell(provider, summary) : `<span class="muted">no score</span>`;
          const marks = [...new Set(group.flatMap((row) => (row.note ? [row.note] : [])))].map((note) => notes.mark(note)).join("");
          const errors = summary.errors.map((error) => escapeHtml(shorten(error))).join("<br>") || `<span class="muted">none</span>`;
          return `<tr>${profileCell}
        <td>${provider}</td>
        <td><span class="pill ${verdict}">${summary.attested}/${summary.total} token</span>${marks}</td>
        <td>${score}</td>
        <td class="small">${calls}</td>
        <td class="small">${errors}</td>
      </tr>`;
        })
        .join("\n");
    })
    .join("\n");
  return `<h2>${title}</h2>
  <table>
    <thead><tr><th>Profile</th><th>Provider</th><th>Attestation</th><th>reCAPTCHA score</th><th>Backend calls</th><th>Errors</th></tr></thead>
    <tbody>${body}</tbody>
  </table>
  ${notes.render()}`;
}

function apiSection(rows: ApiRow[]) {
  const verdictPill = (row: ApiRow) => (row.observation ? "mixed" : row.ok ? "pass" : "block");
  const isCodeExpectation = (expected: string) => /^\d{3}( or \d{3})*$/.test(expected);
  const statusCell = (row: ApiRow, showExpected = true) => {
    const matches = row.expected.split(" or ").includes(String(row.status));
    const pill = `<span class="pill ${verdictPill(row)}">${escapeHtml(String(row.status))}</span>`;
    return matches || !showExpected ? pill : `${pill}<br><span class="muted">expected: ${escapeHtml(row.expected)}</span>`;
  };
  const summaryOf = (groupRows: ApiRow[]) => {
    const checks = groupRows.filter((row) => !row.observation);
    const observations = groupRows.length - checks.length;
    const unexpected = checks.filter((row) => !row.ok).length;
    const base = unexpected > 0 ? `${unexpected} unexpected` : `${checks.length} checks as expected`;
    return observations > 0 ? `${base}, ${observations} observations` : base;
  };

  const isExchangeCase = (row: ApiRow) =>
    row.group === "Exchange rate limiting" || /^(Exchange|GET on the exchange)/.test(row.name);
  const shared = rows.filter((row) => !row.provider);
  const exchangeRows = shared.filter(isExchangeCase).map((row) => (row.group === "Input validation and routing" ? { ...row, group: "Exchange input validation" } : row));
  const verificationRows = shared.filter((row) => !isExchangeCase(row));
  const perProvider = rows.filter((row) => row.provider);

  const sectionsFor = (list: ApiRow[]) =>
    [...new Set(list.map((row) => row.group))]
      .map((group) => {
        const groupRows = list.filter((row) => row.group === group);
        const body = groupRows
          .map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${statusCell(row)}</td><td class="small">${escapeHtml(row.detail)}</td></tr>`)
          .join("\n");
        return `<h3>${escapeHtml(group)} <span class="muted">${summaryOf(groupRows)}</span></h3>
  <table>
    <thead><tr><th>Case</th><th>Status</th><th>Detail</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
      })
      .join("\n");

  const providerSections = [...new Set(perProvider.map((row) => row.group))]
    .map((group) => {
      const groupRows = perProvider.filter((row) => row.group === group);
      const names = [...new Set(groupRows.map((row) => row.name))];
      const cell = (name: string, provider: "recaptcha" | "cloudflare") => {
        const row = groupRows.find((candidate) => candidate.name === name && candidate.provider === provider);
        if (!row) return `<span class="muted">not run</span>`;
        const showDetail = row.observation || /\s/.test(row.detail) || row.detail.includes(",");
        return `${statusCell(row, isCodeExpectation(row.expected))}${showDetail ? `<br><span class="small muted">${escapeHtml(row.detail)}</span>` : ""}`;
      };
      const body = names
        .map((name) => {
          const expected = groupRows.find((row) => row.name === name)!.expected;
          const label = isCodeExpectation(expected) ? "" : `<br><span class="muted">expected: ${escapeHtml(expected)}</span>`;
          return `<tr><td>${escapeHtml(name)}${label}</td><td>${cell(name, "recaptcha")}</td><td>${cell(name, "cloudflare")}</td></tr>`;
        })
        .join("\n");
      return `<h3>${escapeHtml(group)} <span class="muted">reCAPTCHA: ${summaryOf(groupRows.filter((row) => row.provider === "recaptcha"))}; Turnstile: ${summaryOf(groupRows.filter((row) => row.provider === "cloudflare"))}</span></h3>
  <table>
    <thead><tr><th>Case</th><th>reCAPTCHA Enterprise token</th><th>Turnstile (custom provider) token</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
    })
    .join("\n");

  const checks = rows.filter((row) => !row.observation);
  return `<h2>Direct API cases (no browser)</h2>
  <p>${checks.filter((row) => row.ok).length} of ${checks.length} checks behaved as expected, plus ${rows.length - checks.length} observations that document behavior rather than pass or fail. Green status means as expected, amber means observation, red means unexpected.</p>
  <div class="note"><strong>Where the tokens come from.</strong> reCAPTCHA tokens are real: they were obtained by an automated browser through the Firebase SDK. Automated browsers cannot pass Turnstile, so the Turnstile (custom provider) tokens were minted directly with the Admin SDK <code>createToken()</code> for the Cloudflare app, which is the same call the exchange endpoint makes after Turnstile verification succeeds. The backend sees the same kind of token either way, so these cases test the verification path, not Turnstile itself.</div>
  <p class="muted">The PoC API has no mode switch: both Firebase apps (reCAPTCHA and Turnstile) are approved at the same time, and the verification layer only looks at the token, not at which provider is enabled. A per-provider switch like the one planned for hermes is not exercised here.</p>
  <h3 class="muted">Verification layer, same code path for any token (both providers enabled)</h3>
  ${sectionsFor(verificationRows)}
  <h3 class="muted">Turnstile exchange endpoint only (reCAPTCHA has no equivalent endpoint)</h3>
  ${sectionsFor(exchangeRows)}
  <h3 class="muted">Cases that use a real token, per provider</h3>
  ${providerSections}`;
}

function distributionSection() {
  const files = readdirSync(OUT_DIR).filter((name) => name.startsWith("dist-")).sort();
  if (files.length === 0) return "";
  const rows = files.flatMap((file) => (JSON.parse(readFileSync(`${OUT_DIR}/${file}`, "utf8")) as { rows: BrowserRow[] }).rows);
  const profiles = [...new Set(rows.map((row) => row.profile))];

  const outcomeOf = (group: BrowserRow[], provider: BrowserRow["provider"]) => {
    const counts = new Map<string, number>();
    for (const row of group) {
      const probe = isProbe(row.result) ? row.result : null;
      const label =
        provider === "recaptcha"
          ? typeof probe?.score?.score === "number"
            ? `score ${probe.score.score.toFixed(1)}`
            : "no score"
          : probe?.attestation.ok
            ? "token issued"
            : shorten((probe?.attestation.error ?? (row.result as { error: string }).error).replace(/^\[[^\]]+\]\s*/, ""));
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([label, count]) => `${escapeHtml(label)} x ${count}`).join("<br>");
  };

  const body = profiles
    .map((profile) => {
      const providers = (["recaptcha", "cloudflare"] as const).filter((provider) => rows.some((row) => row.profile === profile && row.provider === provider));
      return providers
        .map((provider, index) => {
          const group = rows.filter((row) => row.profile === profile && row.provider === provider);
          const attested = group.map((row) => row.result).filter(isProbe).filter((probe) => probe.attestation.ok).length;
          const verdict = attested === group.length ? "pass" : attested === 0 ? "block" : "mixed";
          const profileCell = index === 0 ? `<td rowspan="${providers.length}"><strong>${escapeHtml(profile)}</strong></td>` : "";
          return `<tr>${profileCell}<td>${provider}</td><td>${group.length}</td><td class="small">${outcomeOf(group, provider)}</td><td><span class="pill ${verdict}">${attested}/${group.length} token</span></td></tr>`;
        })
        .join("\n");
    })
    .join("\n");
  return `<h2>Outcome distribution under volume</h2>
  <p>Each automated profile ran once per fresh browser context, in sequence, after the main run, for both providers. reCAPTCHA outcomes are raw scores. Turnstile has no score, so its outcome is the error returned or a token.</p>
  <table>
    <thead><tr><th>Profile</th><th>Provider</th><th>Samples</th><th>Outcomes</th><th>Got a token</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

const MIN_BENCHMARK_SAMPLES = 30;

interface BenchStats {
  samples: number;
  avg: number;
  median: number;
  p95: number;
  stdDev?: number;
}

function benchmarkFor(provider: "recaptcha" | "cloudflare") {
  const file = readdirSync(OUT_DIR)
    .filter((name) => name.startsWith(`bench-${provider}`))
    .sort()
    .pop();
  if (!file) return null;
  const data = JSON.parse(readFileSync(`${OUT_DIR}/${file}`, "utf8")) as { sampleCount: number; ranAt: number; metrics: Record<string, BenchStats | undefined> };
  return data;
}

const confidenceInterval = (stats: BenchStats) => (stats.stdDev !== undefined && stats.samples > 1 ? (1.96 * stats.stdDev) / Math.sqrt(stats.samples) : null);

type Winner = "recaptcha" | "cloudflare" | "tie" | "inconclusive";
const PROVIDER_NAME = { recaptcha: "reCAPTCHA", cloudflare: "Turnstile" } as const;

function comparisonSection(rows: BrowserRow[]) {
  const notes = footnotes();
  const profiles = [...new Set(rows.map((row) => row.profile))];
  const isHuman = (profile: string) => profile.startsWith("human");

  const groupOf = (profile: string, provider: BrowserRow["provider"]) => rows.filter((row) => row.profile === profile && row.provider === provider);
  const rateOf = (profile: string, provider: BrowserRow["provider"]) => {
    const summary = summarize(groupOf(profile, provider));
    return summary.total === 0 ? 0 : summary.attested / summary.total;
  };
  const inconclusive = (profile: string, provider: BrowserRow["provider"]) => {
    const group = groupOf(profile, provider);
    return isHuman(profile) && group.some((row) => row.note) && summarize(group).attested < group.length;
  };
  const verdictOf = (profile: string): Winner => {
    if (inconclusive(profile, "recaptcha") || inconclusive(profile, "cloudflare")) return "inconclusive";
    const score = (provider: BrowserRow["provider"]) => (isHuman(profile) ? rateOf(profile, provider) : 1 - rateOf(profile, provider));
    const diff = score("recaptcha") - score("cloudflare");
    return Math.abs(diff) < 1e-9 ? "tie" : diff > 0 ? "recaptcha" : "cloudflare";
  };
  const tagFor = (winner: Winner, provider: BrowserRow["provider"]) =>
    winner === "tie" || winner === "inconclusive" ? "" : ` <span class="tag ${winner === provider ? "win" : "lose"}">${winner === provider ? "win" : "lose"}</span>`;
  const verdictCell = (winner: Winner) =>
    winner === "tie"
      ? `<span class="pill mixed">Tie</span>`
      : winner === "inconclusive"
        ? `<span class="pill neutral">Inconclusive</span>`
        : `<span class="pill pass">${PROVIDER_NAME[winner]} wins</span>`;

  const cell = (profile: string, provider: BrowserRow["provider"], winner: Winner) => {
    const group = groupOf(profile, provider);
    const summary = summarize(group);
    const marks = [...new Set(group.flatMap((row) => (row.note ? [row.note] : [])))].map((note) => notes.mark(note)).join("");
    const verdict = summary.attested === summary.total ? "pass" : summary.attested === 0 ? "block" : "mixed";
    const detail = provider === "recaptcha" ? `score ${scoreCell(provider, summary)}` : summary.errors.map((error) => shorten(error.replace(/^\[[^\]]+\]\s*/, ""))).join(", ") || "token issued";
    return `<span class="pill ${verdict}">${summary.attested}/${summary.total} token</span>${tagFor(winner, provider)}<br><span class="small">${escapeHtml(detail)}</span>${marks}`;
  };

  const freshLatencies = (provider: BrowserRow["provider"]) =>
    rows
      .filter((row) => row.provider === provider)
      .map((row) => row.result)
      .filter(isProbe)
      .filter((probe) => probe.attestation.ok)
      .map((probe) => probe.attestation.durationMs)
      .filter((duration) => duration >= CACHED_TOKEN_MS);
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

  const botProfiles = profiles.filter((profile) => !isHuman(profile));
  const humanProfiles = profiles.filter(isHuman);
  const count = (list: string[], provider: BrowserRow["provider"], pick: (summary: ReturnType<typeof summarize>) => number, skipInconclusive = false) =>
    list
      .filter((profile) => !(skipInconclusive && inconclusive(profile, provider)))
      .reduce((sum, profile) => sum + pick(summarize(groupOf(profile, provider))), 0);

  const botRefused = (provider: BrowserRow["provider"]) => count(botProfiles, provider, (summary) => summary.total - summary.attested);
  const botTotal = (provider: BrowserRow["provider"]) => count(botProfiles, provider, (summary) => summary.total);
  const humanPassed = (provider: BrowserRow["provider"]) => count(humanProfiles, provider, (summary) => summary.attested, true);
  const humanTotal = (provider: BrowserRow["provider"]) => count(humanProfiles, provider, (summary) => summary.total, true);
  const humanExcluded = (provider: BrowserRow["provider"]) => humanProfiles.filter((profile) => inconclusive(profile, provider)).length;

  const compare = (recaptcha: number, cloudflare: number, higherIsBetter: boolean): Winner =>
    Math.abs(recaptcha - cloudflare) < 1e-9 ? "tie" : (recaptcha > cloudflare) === higherIsBetter ? "recaptcha" : "cloudflare";

  const botWinner = compare(botRefused("recaptcha") / botTotal("recaptcha"), botRefused("cloudflare") / botTotal("cloudflare"), true);
  const humanWinner = compare(humanPassed("recaptcha") / humanTotal("recaptcha"), humanPassed("cloudflare") / humanTotal("cloudflare"), true);
  const latencyA = freshLatencies("recaptcha");
  const latencyB = freshLatencies("cloudflare");
  const latencyWinner: Winner = latencyA.length > 0 && latencyB.length > 0 ? compare(average(latencyA), average(latencyB), false) : "inconclusive";
  const lowConfidence = Math.min(latencyA.length, latencyB.length) < MIN_BENCHMARK_SAMPLES;
  const latencyText = (values: number[]) =>
    values.length > 0 ? `${Math.round(average(values))} ms avg over ${values.length} fresh attestations` : "no fresh attestation";

  const benchA = benchmarkFor("recaptcha");
  const benchB = benchmarkFor("cloudflare");
  const metricA = benchA?.metrics.initialAttestation;
  const metricB = benchB?.metrics.initialAttestation;
  const benchmarkReady =
    !!metricA && !!metricB && metricA.samples >= MIN_BENCHMARK_SAMPLES && metricB.samples >= MIN_BENCHMARK_SAMPLES && confidenceInterval(metricA) !== null && confidenceInterval(metricB) !== null;
  const benchmarkRow = () => {
    if (!benchmarkReady || !metricA || !metricB) return "";
    const ciA = confidenceInterval(metricA)!;
    const ciB = confidenceInterval(metricB)!;
    const overlap = metricA.avg + ciA >= metricB.avg - ciB && metricB.avg + ciB >= metricA.avg - ciA;
    const winner: Winner = overlap ? "tie" : metricA.avg < metricB.avg ? "recaptcha" : "cloudflare";
    const line = (stats: BenchStats, ci: number) =>
      `<span class="small">${Math.round(stats.avg)} ms avg (95% CI ±${Math.round(ci)})<br>median ${Math.round(stats.median)} ms, p95 ${Math.round(stats.p95)} ms<br>n=${stats.samples}</span>`;
    return summaryRow(
      "Initial attestation latency (benchmark, fresh Firebase app per sample)",
      line(metricA, ciA),
      line(metricB, ciB),
      winner,
      overlap ? `<br><span class="small muted">95% intervals overlap, no clear difference</span>` : `<br><span class="small muted">95% intervals do not overlap, n≥${MIN_BENCHMARK_SAMPLES} on both sides</span>`,
    );
  };

  const verdicts = new Map(profiles.map((profile) => [profile, verdictOf(profile)]));
  const body = profiles
    .map((profile) => {
      const winner = verdicts.get(profile)!;
      const description = rows.find((row) => row.profile === profile)?.description ?? "";
      return `<tr><td><strong>${escapeHtml(profile)}</strong><br><span class="muted">${escapeHtml(description)}</span></td><td>${cell(profile, "recaptcha", winner)}</td><td>${cell(profile, "cloudflare", winner)}</td><td>${verdictCell(winner)}</td></tr>`;
    })
    .join("\n");
  const tally = (winner: Winner) => [...verdicts.values()].filter((value) => value === winner).length;

  const summaryRow = (label: string, a: string, b: string, winner: Winner, extra = "") =>
    `<tr class="summary"><td><strong>${label}</strong></td><td>${a}${tagFor(winner, "recaptcha")}</td><td>${b}${tagFor(winner, "cloudflare")}</td><td>${verdictCell(winner)}${extra}</td></tr>`;

  return `<h2>Side by side: reCAPTCHA Enterprise vs Cloudflare Turnstile</h2>
  <p class="muted">How a winner is decided: for automated profiles the better provider is the one that refused more runs (stopped the bot). For human profiles it is the one that let the real person through. A row is inconclusive when a failure came from the network rather than the provider. For latency, lower is better. These are results of this PoC on one machine, not a general ranking.</p>
  <table>
    <thead><tr><th>Profile</th><th>reCAPTCHA Enterprise (native provider)</th><th>Turnstile (custom provider)</th><th>Result</th></tr></thead>
    <tbody>${body}
    ${summaryRow("Automated runs refused", `${botRefused("recaptcha")}/${botTotal("recaptcha")}`, `${botRefused("cloudflare")}/${botTotal("cloudflare")}`, botWinner)}
    ${summaryRow("Human runs let through", `${humanPassed("recaptcha")}/${humanTotal("recaptcha")}${humanExcluded("recaptcha") ? ` (${humanExcluded("recaptcha")} inconclusive excluded)` : ""}`, `${humanPassed("cloudflare")}/${humanTotal("cloudflare")}${humanExcluded("cloudflare") ? ` (${humanExcluded("cloudflare")} inconclusive excluded)` : ""}`, humanWinner)}
    ${benchmarkReady ? benchmarkRow() : ""}
    ${benchmarkReady ? "" : summaryRow(`Attestation latency (cached tokens under ${CACHED_TOKEN_MS} ms excluded)`, `<span class="small">${latencyText(latencyA)}</span>`, `<span class="small">${latencyText(latencyB)}</span>`, latencyWinner, lowConfidence ? `<br><span class="small muted">low confidence, fewer than ${MIN_BENCHMARK_SAMPLES} samples on one side</span>` : "")}
    <tr class="summary"><td><strong>Profile rows won</strong></td><td>${tally("recaptcha")}</td><td>${tally("cloudflare")}</td><td class="small">${tally("tie")} ties, ${tally("inconclusive")} inconclusive. Unweighted count of rows above.</td></tr>
    </tbody>
  </table>
  ${notes.render()}`;
}

const RERUN_NOTES: Record<string, string> = {};

function throughputSection() {
  const readRows = (prefix: string) =>
    readdirSync(OUT_DIR)
      .filter((name) => name.startsWith(prefix))
      .sort()
      .flatMap((file) => (JSON.parse(readFileSync(`${OUT_DIR}/${file}`, "utf8")) as { rows: any[] }).rows);
  const sequential = readRows("dist-") as BrowserRow[];
  const parallel = readRows("conc-") as { profile: string; provider: BrowserRow["provider"]; concurrency: number; wallMs: number; results: (ProbeResult | { error: string })[] }[];
  if (sequential.length === 0 && parallel.length === 0) return "";

  const lines: string[] = [];
  const keys = [...new Set(sequential.map((row) => `${row.profile}|${row.provider}`))];
  for (const key of keys) {
    const [profile, provider] = key.split("|") as [string, BrowserRow["provider"]];
    const group = sequential.filter((row) => row.profile === profile && row.provider === provider);
    const times = group.map((row) => (isProbe(row.result) ? Date.parse(row.result.startedAt) : NaN)).filter((time) => !Number.isNaN(time));
    const tokens = group.filter((row) => isProbe(row.result) && row.result.attestation.ok).length;
    const span = times.length > 1 ? ((Math.max(...times) - Math.min(...times)) * times.length) / (times.length - 1) : 0;
    const perMinute = span > 0 ? ((tokens / span) * 60_000).toFixed(1) : "n/a";
    lines.push(`<tr><td>${escapeHtml(profile)}</td><td>${provider}</td><td>one browser, sequential</td><td>${tokens}/${group.length}</td><td>${perMinute}</td></tr>`);
  }
  const parallelKeys = [...new Set(parallel.map((row) => `${row.profile}|${row.provider}|${row.concurrency}`))];
  for (const key of parallelKeys) {
    const [profile, provider, concurrency] = key.split("|") as [string, BrowserRow["provider"], string];
    const group = parallel.filter((row) => row.profile === profile && row.provider === provider && String(row.concurrency) === concurrency);
    const total = group.reduce((sum, row) => sum + row.results.length, 0);
    const tokens = group.reduce((sum, row) => sum + row.results.filter((result) => isProbe(result) && result.attestation.ok).length, 0);
    const wall = group.reduce((sum, row) => sum + row.wallMs, 0);
    const perMinute = wall > 0 ? ((tokens / wall) * 60_000).toFixed(1) : "n/a";
    lines.push(`<tr><td>${escapeHtml(profile)}</td><td>${provider}</td><td>${concurrency} browsers in parallel, ${group.length} rounds</td><td>${tokens}/${total}</td><td>${perMinute}</td></tr>`);
  }
  return `<h2>Attacker throughput: tokens per minute</h2>
  <p>How fast an automated profile obtained usable tokens, which is what matters in single-use mode where every request needs a fresh token. A completed probe includes several token requests and API calls, so these are conservative: a leaner client would be faster. Single machine, single IP, headless spoofed profile unless stated.</p>
  <table>
    <thead><tr><th>Profile</th><th>Provider</th><th>Setup</th><th>Probes with a token</th><th>Tokens per minute</th></tr></thead>
    <tbody>${lines.join("\n")}</tbody>
  </table>`;
}

function main() {
  const run = latestRun();
  const browserRows = run.rows
    .filter((row): row is BrowserRow => row.kind === "browser")
    .map((row) => (RERUN_NOTES[`${row.profile}|${row.provider}`] ? { ...row, note: RERUN_NOTES[`${row.profile}|${row.provider}`] } : row));
  const apiRows = run.rows.filter((row): row is ApiRow => row.kind === "api");
  const human = humanRows();
  const scoreBlocked = browserRows.some((row) => isProbe(row.result) && row.result.score?.error);

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>App Check bot simulation results</title>
<style>
  body { font: 15px/1.5 -apple-system, system-ui, sans-serif; max-width: 1100px; margin: 32px auto; padding: 0 16px; color: #1c1c1e; }
  h1 { margin-bottom: 4px; } h2 { margin-top: 36px; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  th, td { border: 1px solid #d8d8dc; padding: 8px 10px; text-align: left; vertical-align: top; }
  th { background: #f4f4f6; }
  td:first-child { min-width: 170px; } sup { color: #8a1c1c; margin-left: 2px; } .notes { margin: 6px 0 0; padding-left: 20px; color: #555; }
  .muted { color: #6b6b70; font-size: 13px; } .small { font-size: 12px; color: #444; }
  .pill { padding: 2px 8px; border-radius: 10px; font-size: 12px; white-space: nowrap; }
  .tag { font-size: 11px; font-weight: 700; text-transform: uppercase; margin-left: 4px; } .tag.win { color: #14612b; } .tag.lose { color: #8a1c1c; }
  .neutral { background: #ececf0; color: #555; } tr.summary td { background: #fafafc; }
  .pass { background: #d7f3de; color: #14612b; } .block { background: #fbdcdc; color: #8a1c1c; } .mixed { background: #fdf0c8; color: #7a5b00; }
  .note { background: #fff7e0; border: 1px solid #f0d98a; padding: 10px 14px; border-radius: 6px; margin: 12px 0; }
  code { background: #f1f1f3; padding: 1px 5px; border-radius: 4px; }
</style></head><body>
<h1>App Check bot simulation results</h1>
<p class="muted">Generated ${run.generatedAt}. ${run.runs} runs per profile and provider against the local PoC (API :3001, web :3000), using the installed Google Chrome driven by Playwright.</p>

<h2>What was tested</h2>
<p>Each browser profile opens <code>/probe/&lt;provider&gt;</code>, which requests an App Check token, calls <code>/api/regular</code>, then sends a limited-use token to <code>/api/sensitive</code> and replays the same token. For reCAPTCHA the page also runs a separate <code>CreateAssessment</code> through <code>/api/diag/recaptcha-score</code> to read the raw risk score.</p>
<ul>
  <li><strong>headless-plain</strong>: default headless Chrome with automation flags.</li>
  <li><strong>headless-spoofed</strong>: headless, normal user agent, <code>navigator.webdriver</code> hidden, fake plugins and languages.</li>
  <li><strong>headed-automated</strong>: visible Chrome driven by Playwright, default flags.</li>
  <li><strong>headed-clean</strong>: visible Chrome, automation flag removed, webdriver hidden.</li>
  <li><strong>real-chrome-cdp</strong>: a real Chrome started normally with its own persistent profile (no Playwright launch, no spoofing) and driven over the Chrome DevTools Protocol. Site data for localhost is cleared between runs.<br><span class="muted">CDP (Chrome DevTools Protocol) is the debugging interface Chrome exposes on a local port. DevTools, Playwright and Puppeteer all use it to inspect and drive a browser. Normally Playwright starts Chrome itself with extra automation flags. Here Chrome is started like a normal user would, and Playwright only attaches to it afterwards, so the browser looks like an ordinary Chrome that a script happens to be controlling.</span></li>
</ul>
${scoreBlocked ? `<div class="note"><strong>Score data missing.</strong> The raw reCAPTCHA score could not be read because the Firebase Admin service account lacks <code>recaptchaenterprise.assessments.create</code>. Grant it the <strong>reCAPTCHA Enterprise Agent</strong> role in the Google Cloud project and rerun to fill the score column. Attestation pass/fail below is still real, since Firebase calls <code>CreateAssessment</code> itself.</div>` : ""}

${comparisonSection([...browserRows, ...human])}
${browserSection(browserRows, "Automated browser profiles")}
${human.length > 0 ? browserSection(human, "Real human sessions") : `<div class="note"><strong>No human baseline yet.</strong> Open <code>http://localhost:3000/probe/recaptcha</code> and <code>/probe/cloudflare</code> in a normal Chrome and save the JSON as <code>scripts/simulate/out/human-*.json</code> to include it here.</div>`}
${apiSection(apiRows)}
${distributionSection()}
${throughputSection()}

<h2>Reading the results</h2>
<ul>
  <li>The score column lists the raw reCAPTCHA Enterprise score of each run, from a separate <code>CreateAssessment</code> call. App Check performs its own assessment on its own token, so the score shown and the pass or fail of the token exchange are not guaranteed to match.</li>
  <li>Turnstile error <code>600010</code> belongs to Cloudflare's <code>600*</code> family, documented as "Generic challenge failure" with the guidance "Bot behavior detected". The documentation does not say it is specific to automation. Here it appeared in every automated run and in none of the human runs on the same origin, which supports automation detection but does not prove which signal triggered it. No Firebase call is made when it happens.</li>
  <li>The reCAPTCHA minimum score threshold in the Firebase Console is 0.5 (as configured by the project owner, not read from the Console). Every reCAPTCHA run in this report scored 0.7 or 0.9 and got a token. No run scored below the threshold, so this data does not test the threshold from below.</li>
  <li>Human variants: incognito without VPN scored 0.7 (lower than the 0.9 of the normal profile but still passing). With the VPN on, the normal profile still scored 0.9, so the VPN alone did not lower the score in this single run, assuming the VPN changed the egress IP (not verified). The Turnstile widget itself did issue a token with the VPN on: the exchange endpoint was reached with a token and then timed out calling Cloudflare Siteverify, so this run does not show Turnstile rejecting the VPN. The timeout is most likely the API host's network while the VPN was on, which is an inference.</li>
  <li><strong>On this machine reCAPTCHA did not separate automation from a human.</strong> All automated profiles scored 0.9 and received tokens, including 20 of 20 samples each of headless-plain and headless-spoofed. This is a single machine and IP, so it should not be generalized.</li>
  <li><strong>Turnstile refused every Playwright-launched browser but not a real Chrome driven over CDP.</strong> Every run from a browser launched by Playwright got error 600010 (headless and headed, with or without spoofing, in the main run, the 20-sample runs and the parallel runs). The <code>real-chrome-cdp</code> profile, a normally started Chrome with its own profile and no spoofing at all, got a Turnstile token in 3 of 3 runs. So in this PoC Turnstile separates how the browser was launched and driven, not automation as such, and a scripted real browser passes. Which signal Cloudflare uses was not investigated.</li>
  <li>reCAPTCHA also issued tokens to <code>real-chrome-cdp</code> (score 0.9, 3 of 3), the same as for the spoofed profiles.</li>
  <li><strong>Design observation:</strong> the exchange endpoint calls Siteverify with only the secret and the response token. It does not send the optional <code>remoteip</code> field, so a Turnstile token is not tied to the visitor's IP on our side. Whether Siteverify enforces that field was not tested.</li>
  <li>Forged, unsigned and tampered tokens are rejected at verification with 401, and the positive controls (an untouched real token, the configured CORS origin) pass, so the negative cases are not passing trivially.</li>
  <li>Not covered because they need a real human, a different environment, or a config change: reuse of a real Turnstile token (<code>timeout-or-duplicate</code>), Turnstile hostname and action mismatch against a real widget, Cloudflare test keys, a genuinely expired token (needs a 30 minute wait), a threshold sweep in the Firebase Console, other browsers and mobile devices, running from datacenter, residential or mobile IPs, using a token from a different real network, device farms, CAPTCHA solving services, and the human baselines beyond one run each on one machine.</li>
</ul>
${researchSection()}
${costSection()}
<p class="muted">Reproduce: <code>bun dev</code>, then <code>bun scripts/simulate/run.ts</code> and <code>bun scripts/simulate/report.ts</code>. Output: <code>docs/results.html</code>.</p>
</body></html>`;

  mkdirSync("docs", { recursive: true });
  writeFileSync("docs/results.html", html);
  console.log("Wrote docs/results.html");
}

main();
