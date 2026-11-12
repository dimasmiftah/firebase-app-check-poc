import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium, type Browser } from "playwright-core";
import type { ProbeResult } from "../../apps/web/components/Probe";

export const WEB_URL = process.env.WEB_URL ?? "http://localhost:3000";
export const CHROME_PATH = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const PROBE_TIMEOUT_MS = 90_000;
const CDP_PORT = Number(process.env.CDP_PORT ?? 9333);
const REAL_PROFILE_DIR = "scripts/simulate/out/real-chrome-profile";
const REAL_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export interface Profile {
  name: string;
  description: string;
  headless: boolean;
  args: string[];
  dropAutomationFlag: boolean;
  spoof: boolean;
  real?: boolean;
}

export const PROFILES: Profile[] = [
  {
    name: "headless-plain",
    description: "Chrome headless, default automation flags",
    headless: true,
    args: [],
    dropAutomationFlag: false,
    spoof: false,
  },
  {
    name: "headless-spoofed",
    description: "Headless with normal UA, navigator.webdriver hidden, fake plugins and languages",
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
    dropAutomationFlag: true,
    spoof: true,
  },
  {
    name: "headed-automated",
    description: "Visible Chrome window driven by Playwright with default automation flags",
    headless: false,
    args: [],
    dropAutomationFlag: false,
    spoof: false,
  },
  {
    name: "headed-clean",
    description: "Visible Chrome, automation flag removed, webdriver hidden",
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
    dropAutomationFlag: true,
    spoof: true,
  },
  {
    name: "real-chrome-cdp",
    description:
      "Real Chrome started normally with its own persistent profile and driven over CDP, no spoofing and no automation flags, localhost site data cleared between runs",
    headless: false,
    args: [],
    dropAutomationFlag: false,
    spoof: false,
    real: true,
  },
];

export async function createContext(browser: Browser, profile: Profile) {
  const context = await browser.newContext(profile.spoof ? { userAgent: REAL_UA, locale: "en-US" } : {});
  if (profile.spoof) {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
    });
  }
  return context;
}

export async function probeOnce(browser: Browser, profile: Profile, provider: string): Promise<ProbeResult | { error: string }> {
  const context = await createContext(browser, profile);
  const page = await context.newPage();
  try {
    await page.goto(`${WEB_URL}/probe/${provider}`);
    await page.waitForFunction(() => (window as unknown as { __probe?: unknown }).__probe !== undefined, null, {
      timeout: PROBE_TIMEOUT_MS,
    });
    return (await page.evaluate(() => (window as unknown as { __probe: ProbeResult }).__probe)) as ProbeResult;
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : String(cause) };
  } finally {
    await context.close();
  }
}


const probeResultOf = async (page: import("playwright-core").Page, provider: string): Promise<ProbeResult | { error: string }> => {
  try {
    await page.goto(`${WEB_URL}/probe/${provider}`);
    await page.waitForFunction(() => (window as unknown as { __probe?: unknown }).__probe !== undefined, null, {
      timeout: PROBE_TIMEOUT_MS,
    });
    return (await page.evaluate(() => (window as unknown as { __probe: ProbeResult }).__probe)) as ProbeResult;
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : String(cause) };
  }
};

async function waitForCdp() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (response.ok) return;
    } catch {
      // Chrome is still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Chrome did not expose the CDP port in time");
}

export interface ProfileSession {
  probe(provider: string): Promise<ProbeResult | { error: string }>;
  close(): Promise<void>;
}

export async function openProfile(profile: Profile): Promise<ProfileSession> {
  if (profile.real) {
    mkdirSync(REAL_PROFILE_DIR, { recursive: true });
    const child: ChildProcess = spawn(
      CHROME_PATH,
      [`--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${REAL_PROFILE_DIR}`, "--no-first-run", "--no-default-browser-check", "about:blank"],
      { stdio: "ignore" },
    );
    await waitForCdp();
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
    const context = browser.contexts()[0];
    return {
      async probe(provider) {
        const page = await context.newPage();
        try {
          const session = await context.newCDPSession(page);
          await session.send("Storage.clearDataForOrigin", { origin: new URL(WEB_URL).origin, storageTypes: "all" });
          return await probeResultOf(page, provider);
        } finally {
          await page.close().catch(() => {});
        }
      },
      async close() {
        await browser.close().catch(() => {});
        child.kill();
      },
    };
  }

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: profile.headless,
    args: profile.args,
    ignoreDefaultArgs: profile.dropAutomationFlag ? ["--enable-automation"] : undefined,
  });
  return {
    probe: (provider) => probeOnce(browser, profile, provider),
    close: () => browser.close(),
  };
}
