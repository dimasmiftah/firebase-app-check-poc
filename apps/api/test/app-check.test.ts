import { describe, expect, it } from "vitest";
import { buildApp, fakeAppCheck, CLOUDFLARE_APP, OTHER_APP, RECAPTCHA_APP, withToken } from "./helpers";

describe("regular tokens", () => {
  it("serves public endpoint without a token", async () => {
    const { app } = buildApp();
    const res = await app.request("/api/public");
    expect(res.status).toBe(200);
  });

  it("accepts a reusable token multiple times", async () => {
    const { app } = buildApp();
    for (let i = 0; i < 3; i++) {
      const res = await app.request("/api/regular", withToken(`valid|${RECAPTCHA_APP}`));
      expect(res.status).toBe(200);
    }
  });

  it("rejects missing, invalid and expired tokens", async () => {
    const { app } = buildApp();
    expect((await app.request("/api/regular")).status).toBe(401);
    const invalid = await app.request("/api/regular", withToken("garbage"));
    expect(invalid.status).toBe(401);
    expect((await invalid.json()).error).toBe("invalid_token");
    const expired = await app.request("/api/regular", withToken("expired|x"));
    expect(expired.status).toBe(401);
    expect((await expired.json()).error).toBe("token_expired");
  });
});

describe("limited-use tokens", () => {
  it("accepts first use and rejects replay", async () => {
    const { app } = buildApp();
    const token = `valid|${RECAPTCHA_APP}|1`;
    expect((await app.request("/api/sensitive", withToken(token, "POST"))).status).toBe(200);
    const replay = await app.request("/api/sensitive", withToken(token, "POST"));
    expect(replay.status).toBe(409);
    expect((await replay.json()).error).toBe("token_already_consumed");
  });

  it("accepts a new token after one was consumed", async () => {
    const { app } = buildApp();
    await app.request("/api/sensitive", withToken(`valid|${RECAPTCHA_APP}|1`, "POST"));
    expect((await app.request("/api/sensitive", withToken(`valid|${RECAPTCHA_APP}|2`, "POST"))).status).toBe(200);
  });

  it("accepts only one of several concurrent requests with the same token", async () => {
    const { app } = buildApp();
    const token = `valid|${CLOUDFLARE_APP}|c`;
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => app.request("/api/sensitive", withToken(token, "POST"))),
    );
    const statuses = responses.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(4);
  });

  it("accepts an unconsumed regular token on the consume-enabled endpoint", async () => {
    const { app } = buildApp({ verifyAppCheckToken: fakeAppCheck().verifyAppCheckToken });
    const res = await app.request("/api/sensitive", withToken(`valid|${RECAPTCHA_APP}|regular`, "POST"));
    expect(res.status).toBe(200);
  });

  it("rejects missing token on sensitive endpoint", async () => {
    const { app } = buildApp();
    expect((await app.request("/api/sensitive", { method: "POST" })).status).toBe(401);
  });
});

describe("multi-app verification", () => {
  it("identifies the originating Firebase app from the verified token", async () => {
    const { app } = buildApp();
    const a = await (await app.request("/api/regular", withToken(`valid|${RECAPTCHA_APP}`))).json();
    const b = await (await app.request("/api/regular", withToken(`valid|${CLOUDFLARE_APP}`))).json();
    expect(a).toMatchObject({ appId: RECAPTCHA_APP, provider: "recaptcha" });
    expect(b).toMatchObject({ appId: CLOUDFLARE_APP, provider: "cloudflare" });
  });

  it("ignores client supplied app headers", async () => {
    const { app } = buildApp();
    const res = await app.request("/api/regular", {
      headers: { "X-Firebase-AppCheck": `valid|${RECAPTCHA_APP}`, "X-Firebase-App-Id": CLOUDFLARE_APP },
    });
    expect((await res.json()).provider).toBe("recaptcha");
  });

  it("rejects tokens from unapproved apps", async () => {
    const { app } = buildApp();
    const res = await app.request("/api/regular", withToken(`valid|${OTHER_APP}`));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("app_not_allowed");
  });

  it("returns 503 when Firebase is not configured", async () => {
    const { app } = buildApp({ appCheckReady: false });
    expect((await app.request("/api/regular", withToken("x"))).status).toBe(503);
  });
});
