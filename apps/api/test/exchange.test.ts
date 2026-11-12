import { describe, expect, it } from "vitest";
import { buildApp, CLOUDFLARE_APP } from "./helpers";

const exchange = (app: ReturnType<typeof buildApp>["app"], body: unknown) =>
  app.request("/app-check/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("turnstile exchange", () => {
  it("exchanges a valid turnstile token for an app check token with explicit ttl", async () => {
    const { app, issued } = buildApp();
    const res = await exchange(app, { turnstileToken: "good-1" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe(`valid|${CLOUDFLARE_APP}`);
    expect(body.ttlMillis).toBe(30 * 60_000);
    expect(issued).toEqual([{ appId: CLOUDFLARE_APP, ttlMillis: 30 * 60_000 }]);
  });

  it("ignores any client supplied app id", async () => {
    const { app, issued } = buildApp();
    await exchange(app, { turnstileToken: "good-2", appId: "1:1:web:other" });
    expect(issued[0].appId).toBe(CLOUDFLARE_APP);
  });

  it("rejects invalid turnstile tokens", async () => {
    const { app, issued } = buildApp();
    const res = await exchange(app, { turnstileToken: "nope" });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("turnstile_failed");
    expect(issued).toHaveLength(0);
  });

  it("rejects reused turnstile tokens", async () => {
    const { app } = buildApp();
    await exchange(app, { turnstileToken: "good-3" });
    const res = await exchange(app, { turnstileToken: "good-3" });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("turnstile_expired_or_reused");
  });

  it("rejects an unexpected hostname", async () => {
    const { app, issued } = buildApp();
    const res = await exchange(app, { turnstileToken: "bad-host" });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("hostname_mismatch");
    expect(issued).toHaveLength(0);
  });

  it("rejects a missing turnstile token", async () => {
    const { app } = buildApp();
    expect((await exchange(app, {})).status).toBe(400);
    expect((await exchange(app, { turnstileToken: "" })).status).toBe(400);
    const notJson = await app.request("/app-check/exchange", { method: "POST", body: "x" });
    expect(notJson.status).toBe(400);
  });

  it("rate limits repeated exchanges", async () => {
    const { app } = buildApp();
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await exchange(app, { turnstileToken: "nope" })).status;
    expect(last).toBe(429);
  });

  it("returns 503 when Turnstile is not configured", async () => {
    const { app } = buildApp({ exchangeReady: false });
    expect((await exchange(app, { turnstileToken: "good-4" })).status).toBe(503);
  });
});
