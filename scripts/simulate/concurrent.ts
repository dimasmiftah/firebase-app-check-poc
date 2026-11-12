import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import type { ProbeResult } from "../../apps/web/components/Probe";
import { CHROME_PATH, PROFILES, probeOnce } from "./browser";

const CONCURRENCY = Number(process.env.CONCURRENCY ?? 8);
const ROUNDS = Number(process.env.ROUNDS ?? 2);
const PROFILE_NAME = process.env.PROFILE ?? "headless-spoofed";
const PROVIDERS = process.env.ONLY_PROVIDERS?.split(",") ?? ["recaptcha", "cloudflare"];

async function main() {
  const profile = PROFILES.find((candidate) => candidate.name === PROFILE_NAME);
  if (!profile || profile.real) throw new Error(`Unknown or unsupported profile for parallel runs: ${PROFILE_NAME}`);

  const rows: unknown[] = [];
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: profile.headless,
    args: profile.args,
    ignoreDefaultArgs: profile.dropAutomationFlag ? ["--enable-automation"] : undefined,
  });

  for (const provider of PROVIDERS) {
    for (let round = 1; round <= ROUNDS; round++) {
      const startedAt = performance.now();
      const results = await Promise.all(Array.from({ length: CONCURRENCY }, () => probeOnce(browser, profile, provider)));
      const wallMs = Math.round(performance.now() - startedAt);
      const probes = results.filter((result): result is ProbeResult => !("error" in result));
      const tokens = probes.filter((probe) => probe.attestation.ok).length;
      const scores = probes.map((probe) => probe.score?.score).filter((score): score is number => typeof score === "number");
      console.log(`[parallel ${profile.name}] ${provider} round ${round}: ${tokens}/${CONCURRENCY} tokens, scores ${scores.join(",") || "n/a"}, wall ${wallMs} ms`);
      rows.push({ kind: "parallel", profile: profile.name, provider, concurrency: CONCURRENCY, round, wallMs, results });
    }
  }
  await browser.close();

  mkdirSync("scripts/simulate/out", { recursive: true });
  const file = `scripts/simulate/out/conc-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
  console.log(`Saved ${file}`);
}

await main();
