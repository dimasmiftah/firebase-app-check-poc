import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import type { ProbeResult } from "../../apps/web/components/Probe";
import { CHROME_PATH, PROBE_TIMEOUT_MS, PROFILES, WEB_URL, createContext, openProfile } from "./browser";
import { runApiCases, runRateLimitCases, type ApiRow, type HarvestedTokens } from "./api-cases";

const RUNS = Number(process.env.RUNS ?? 3);
const OUT_PREFIX = process.env.OUT_PREFIX ?? "run";
const ONLY_PROFILES = process.env.ONLY_PROFILES?.split(",");
const ONLY_PROVIDERS = process.env.ONLY_PROVIDERS?.split(",") ?? ["recaptcha", "cloudflare"];

async function runBrowserProfiles() {
  const rows: unknown[] = [];
  for (const profile of PROFILES.filter((candidate) => !ONLY_PROFILES || ONLY_PROFILES.includes(candidate.name))) {
    const session = await openProfile(profile);
    for (const provider of ONLY_PROVIDERS) {
      for (let run = 1; run <= RUNS; run++) {
        const result = await session.probe(provider);
        rows.push({ kind: "browser", profile: profile.name, description: profile.description, provider, run, result });
        const summary =
          "error" in result
            ? `error: ${result.error}`
            : `score=${result.score?.score ?? "n/a"} attest=${result.attestation.ok ? "ok" : result.attestation.error} regular=${result.regular?.status} sensitive=${result.sensitive?.status} replay=${result.replay?.status}`;
        console.log(`[${profile.name}] ${provider} #${run}: ${summary}`);
      }
    }
    await session.close();
  }
  return rows;
}

async function harvestTokens(limitedCount: number): Promise<HarvestedTokens | null> {
  const profile = PROFILES.find((candidate) => candidate.name === "headless-spoofed")!;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const browser = await chromium.launch({
      executablePath: CHROME_PATH,
      headless: profile.headless,
      args: profile.args,
      ignoreDefaultArgs: profile.dropAutomationFlag ? ["--enable-automation"] : undefined,
    });
    try {
      const context = await createContext(browser, profile);
      const page = await context.newPage();
      await page.goto(`${WEB_URL}/probe/recaptcha`);
      await page.waitForFunction(() => (window as unknown as { __probe?: unknown }).__probe !== undefined, null, {
        timeout: PROBE_TIMEOUT_MS,
      });
      const attested = await page.evaluate(() => (window as unknown as { __probe: ProbeResult }).__probe.attestation.ok);
      if (!attested) continue;
      const regular = await page.evaluate(() => (window as unknown as { __tokenSource: { regular(): Promise<string> } }).__tokenSource.regular());
      const limited: string[] = [];
      for (let i = 0; i < limitedCount; i++) {
        limited.push(
          await page.evaluate(() => (window as unknown as { __tokenSource: { limited(): Promise<string> } }).__tokenSource.limited()),
        );
      }
      return { regular, limited };
    } catch (cause) {
      console.log(`[harvest] attempt ${attempt} failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      await browser.close();
    }
  }
  return null;
}

function mintCloudflareTokens(count: number): HarvestedTokens | null {
  const result = Bun.spawnSync(["bun", "scripts/mint-tokens.ts", String(count)], { cwd: "apps/api" });
  if (result.exitCode !== 0) {
    console.log(`[mint] failed: ${result.stderr.toString().trim().slice(0, 300)}`);
    return null;
  }
  const tokens = JSON.parse(result.stdout.toString().trim().split("\n").pop() ?? "[]") as string[];
  return tokens.length === count ? { regular: tokens[0], limited: tokens.slice(1) } : null;
}

const logApiRow = (row: ApiRow) => console.log(`[api${row.provider ? `:${row.provider}` : ""}] ${row.group} / ${row.name}: ${row.status} ${row.detail}`);

async function main() {
  const only = process.argv[2];
  const rows: unknown[] = [];
  if (only !== "api") rows.push(...(await runBrowserProfiles()));
  if (only !== "browser") {
    const tokens = { recaptcha: await harvestTokens(12), cloudflare: mintCloudflareTokens(13) };
    rows.push(...(await runApiCases(tokens, logApiRow)));
    rows.push(...(await runRateLimitCases(logApiRow)));
  }

  mkdirSync("scripts/simulate/out", { recursive: true });
  const file = `scripts/simulate/out/${OUT_PREFIX}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), runs: RUNS, rows }, null, 2));
  console.log(`Saved ${file}`);
}

await main();
