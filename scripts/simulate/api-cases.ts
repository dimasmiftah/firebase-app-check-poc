import { createSign, generateKeyPairSync } from "node:crypto";

const API_URL = process.env.API_URL ?? "http://localhost:3001";
const EVIL_ORIGIN = "https://evil.example";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "http://localhost:3000";
const RATE_LIMIT_RECOVERY_WAIT_MS = 62_000;

export type Provider = "recaptcha" | "cloudflare";

export interface HarvestedTokens {
  regular: string;
  limited: string[];
}

export interface ApiRow {
  kind: "api";
  group: string;
  name: string;
  expected: string;
  status: number | string;
  detail: string;
  ok?: boolean;
  observation?: boolean;
  provider?: Provider;
}

interface Response {
  status: number;
  detail: string;
  headers: Headers;
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${API_URL}${path}`, init);
  const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
  return { status: response.status, detail: body?.error ?? body?.message ?? "", headers: response.headers };
}

const withToken = (token: string, extra: Record<string, string> = {}) => ({ headers: { "X-Firebase-AppCheck": token, ...extra } });
const sensitive = (token: string) => request("/api/sensitive", { method: "POST", ...withToken(token) });
const regular = (token: string) => request("/api/regular", withToken(token));
const exchange = (body: string, contentType = "application/json") =>
  request("/app-check/exchange", { method: "POST", headers: { "Content-Type": contentType }, body });

const base64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

function forgedJwt(alg: "none" | "RS256") {
  const header = base64url(JSON.stringify({ alg, typ: "JWT", kid: "forged-kid" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(
    JSON.stringify({ iss: "https://firebaseappcheck.googleapis.com/0", sub: "1:0:web:forged", aud: ["projects/0"], iat: now, exp: now + 3600 }),
  );
  if (alg === "none") return `${header}.${payload}.`;
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return `${header}.${payload}.${base64url(createSign("RSA-SHA256").update(`${header}.${payload}`).sign(privateKey))}`;
}

function flipLastChar(value: string) {
  return value.slice(0, -1) + (value.endsWith("A") ? "B" : "A");
}

function tamperPayload(token: string) {
  const [header, payload, signature] = token.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  claims.sub = "1:0:web:attacker";
  return `${header}.${base64url(JSON.stringify(claims))}.${signature}`;
}

function swapAlg(token: string) {
  const [header, payload, signature] = token.split(".");
  const parsed = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
  parsed.alg = "HS256";
  return `${base64url(JSON.stringify(parsed))}.${payload}.${signature}`;
}

const statusIn = (response: Response, codes: number[]) => codes.includes(response.status);

export async function runApiCases(tokens: Partial<Record<Provider, HarvestedTokens | null>>, log: (row: ApiRow) => void) {
  const rows: ApiRow[] = [];
  const add = (row: Omit<ApiRow, "kind">) => {
    const full: ApiRow = { kind: "api", ...row };
    rows.push(full);
    log(full);
  };
  const expectStatus = async (group: string, name: string, expected: number[], run: () => Promise<Response>, provider?: Provider) => {
    const response = await run();
    add({ group, name, expected: expected.join(" or "), status: response.status, detail: response.detail, ok: statusIn(response, expected), provider });
  };

  const basic = "Missing and forged tokens";
  await expectStatus(basic, "No token on /api/regular", [401], () => request("/api/regular"));
  await expectStatus(basic, "No token on /api/sensitive", [401], () => request("/api/sensitive", { method: "POST" }));
  await expectStatus(basic, "Garbage token", [401], () => regular("invalid.token.value"));
  await expectStatus(basic, "Empty token header", [401], () => regular(""));
  await expectStatus(basic, "JWT with alg none", [401], () => regular(forgedJwt("none")));
  await expectStatus(basic, "JWT signed with attacker RSA key", [401], () => regular(forgedJwt("RS256")));

  const input = "Input validation and routing";
  await expectStatus(input, "Exchange with fake Turnstile token", [401, 403], () => exchange(JSON.stringify({ turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" })));
  await expectStatus(input, "Exchange with empty body object", [400], () => exchange("{}"));
  await expectStatus(input, "Exchange with invalid JSON", [400], () => exchange("{not json"));
  await expectStatus(input, "Exchange with numeric turnstileToken", [400], () => exchange(JSON.stringify({ turnstileToken: 12345 })));
  await expectStatus(input, "Exchange with array turnstileToken", [400], () => exchange(JSON.stringify({ turnstileToken: ["a", "b"] })));
  await expectStatus(input, "Exchange with null turnstileToken", [400], () => exchange(JSON.stringify({ turnstileToken: null })));
  await expectStatus(input, "Exchange with 3000 character token", [400], () => exchange(JSON.stringify({ turnstileToken: "A".repeat(3000) })));
  const withAppId = await exchange(JSON.stringify({ turnstileToken: "fake", appId: "1:0:web:attacker" }));
  add({
    group: input,
    name: "Exchange body carrying an app ID field (fake Turnstile token)",
    expected: "not testable without a real Turnstile token",
    status: withAppId.status,
    detail: `${withAppId.detail}: rejected at Turnstile verification before the body is used, so this does not prove the appId field is ignored`,
    observation: true,
  });
  await expectStatus(input, "GET on the exchange endpoint", [404], () => request("/app-check/exchange"));
  await expectStatus(input, "POST on /api/regular", [404], () => request("/api/regular", { method: "POST" }));
  await expectStatus(input, "GET on /api/sensitive", [404], () => request("/api/sensitive"));
  await expectStatus(input, "16 KB token header", [400, 401, 431], () => regular("A".repeat(16_000)));

  const cors = "CORS";
  const preflight = await request("/api/sensitive", {
    method: "OPTIONS",
    headers: { Origin: EVIL_ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-firebase-appcheck" },
  });
  const allowOrigin = preflight.headers.get("access-control-allow-origin");
  add({
    group: cors,
    name: "Preflight from an untrusted origin",
    expected: "Allow-Origin is not the untrusted origin or *",
    status: preflight.status,
    detail: `access-control-allow-origin: ${allowOrigin ?? "(absent)"}`,
    ok: allowOrigin !== EVIL_ORIGIN && allowOrigin !== "*",
  });

  const allowedPreflight = await request("/api/sensitive", {
    method: "OPTIONS",
    headers: { Origin: ALLOWED_ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-firebase-appcheck" },
  });
  const allowedOrigin = allowedPreflight.headers.get("access-control-allow-origin");
  add({
    group: cors,
    name: "Preflight from the configured origin (positive control)",
    expected: "Allow-Origin echoes the configured origin",
    status: allowedPreflight.status,
    detail: `access-control-allow-origin: ${allowedOrigin ?? "(absent)"}`,
    ok: allowedOrigin === ALLOWED_ORIGIN,
  });

  for (const provider of ["recaptcha", "cloudflare"] as const) {
    const providerTokens = tokens[provider];
    if (providerTokens) {
      await runTokenCases(
        providerTokens,
        (row) => add({ ...row, provider }),
        (group, name, expected, run) => expectStatus(group, name, expected, run, provider),
      );
    } else {
      add({
        group: "Real token handling",
        name: "Token based cases skipped",
        expected: "a real App Check token",
        status: "skipped",
        detail: "Could not obtain an App Check token for this provider",
        observation: true,
        provider,
      });
    }
  }

  return rows;
}

async function runTokenCases(
  tokens: HarvestedTokens,
  add: (row: Omit<ApiRow, "kind">) => void,
  expectStatus: (group: string, name: string, expected: number[], run: () => Promise<Response>) => Promise<void>,
) {
  const tamper = "Tampered real tokens";
  const { regular: general, limited } = tokens;
  await expectStatus(tamper, "Untouched real token (positive control)", [200], () => regular(general));
  await expectStatus(tamper, "Signature last character flipped", [401], () => regular(flipLastChar(general)));
  await expectStatus(tamper, "Payload sub changed, original signature kept", [401], () => regular(tamperPayload(general)));
  await expectStatus(tamper, "Header alg swapped to HS256", [401], () => regular(swapAlg(general)));
  await expectStatus(tamper, "Token truncated", [401], () => regular(general.slice(0, general.length - 40)));
  await expectStatus(tamper, "Extra segment appended", [401], () => regular(`${general}.extra`));
  await expectStatus(tamper, "Bearer prefix added", [401], () => regular(`Bearer ${general}`));
  await expectStatus(tamper, "Valid token in the Authorization header", [401], () =>
    request("/api/regular", { headers: { Authorization: general } }),
  );
  await expectStatus(tamper, "Valid token with a lowercase header name", [200], () =>
    request("/api/regular", { headers: { "x-firebase-appcheck": general } }),
  );

  const harvest = "Token harvesting and general token reuse";
  const reuse: number[] = [];
  for (let i = 0; i < 10; i++) {
    const response = await request("/api/regular", withToken(general, { "User-Agent": `curl/8.${i}`, "X-Forwarded-For": `203.0.113.${i + 1}` }));
    reuse.push(response.status);
  }
  add({
    group: harvest,
    name: "One token replayed 10 times from scripted clients",
    expected: "200 each time (a general token is a bearer token for its whole TTL)",
    status: reuse.every((status) => status === 200) ? "10 of 10 accepted" : reuse.join(","),
    detail: "Different User-Agent and X-Forwarded-For per request; nothing binds the token to the client that earned it",
    observation: true,
  });

  const first = await sensitive(general);
  const second = await sensitive(general);
  add({
    group: harvest,
    name: "General token sent to /api/sensitive twice",
    expected: "200 then 409",
    status: `${first.status} then ${second.status}`,
    detail: "A general token is accepted once by the replay protected endpoint",
    ok: first.status === 200 && second.status === 409,
  });
  const afterConsume = await regular(general);
  add({
    group: harvest,
    name: "Consumed general token sent to /api/regular",
    expected: "200 (the regular endpoint does not check consumption)",
    status: afterConsume.status,
    detail: afterConsume.detail,
    observation: true,
  });

  const replay = "Limited-use tokens and replay";
  if (limited.length >= 12) {
    const raceToken = limited[0];
    const race = await Promise.all(Array.from({ length: 10 }, () => sensitive(raceToken)));
    const ok = race.filter((response) => response.status === 200).length;
    const conflict = race.filter((response) => response.status === 409).length;
    add({
      group: replay,
      name: "One limited-use token sent 10 times in parallel",
      expected: "exactly one 200, the rest 409",
      status: `${ok} x 200, ${conflict} x 409`,
      detail: race.map((response) => response.status).join(","),
      ok: ok === 1 && conflict === 9,
    });

    const sequential = limited[1];
    const used = await sensitive(sequential);
    const again = await sensitive(sequential);
    add({
      group: replay,
      name: "Limited-use token sent sequentially twice",
      expected: "200 then 409",
      status: `${used.status} then ${again.status}`,
      detail: again.detail,
      ok: used.status === 200 && again.status === 409,
    });

    const reusedOnRegular = await regular(sequential);
    add({
      group: replay,
      name: "Consumed limited-use token sent to /api/regular",
      expected: "200 (the regular endpoint does not check consumption)",
      status: reusedOnRegular.status,
      detail: reusedOnRegular.detail,
      observation: true,
    });

    const fresh = await Promise.all(limited.slice(2, 12).map((token) => sensitive(token)));
    add({
      group: replay,
      name: "Ten different limited-use tokens in parallel",
      expected: "ten 200 (distinct tokens do not interfere)",
      status: `${fresh.filter((response) => response.status === 200).length} x 200`,
      detail: fresh.map((response) => response.status).join(","),
      ok: fresh.every((response) => response.status === 200),
    });
  }
}

export async function runRateLimitCases(log: (row: ApiRow) => void) {
  const rows: ApiRow[] = [];
  const group = "Exchange rate limiting";
  const statuses: number[] = [];
  for (let i = 0; i < 80; i++) {
    statuses.push((await exchange(JSON.stringify({ turnstileToken: `flood-${i}` }))).status);
  }
  const limited = statuses.filter((status) => status === 429).length;
  const flood: ApiRow = {
    kind: "api",
    group,
    name: "Flood the exchange endpoint with 80 fake tokens",
    expected: "429 after the per-minute limit",
    status: limited > 0 ? 429 : statuses[statuses.length - 1],
    detail: `${limited} of ${statuses.length} requests rate limited`,
    ok: limited > 0,
  };
  rows.push(flood);
  log(flood);

  await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_RECOVERY_WAIT_MS));
  const recovered = await exchange(JSON.stringify({ turnstileToken: "after-window" }));
  const recovery: ApiRow = {
    kind: "api",
    group,
    name: "Request after the rate limit window passed",
    expected: "403 (limit lifted, fake token rejected by Turnstile)",
    status: recovered.status,
    detail: recovered.detail,
    ok: recovered.status === 403,
  };
  rows.push(recovery);
  log(recovery);
  return rows;
}
