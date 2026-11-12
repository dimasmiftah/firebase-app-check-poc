import type { AppCheck } from "firebase/app-check";
import type { Provider } from "@poc/shared";
import { callEndpoint } from "./api";
import { requestToken } from "./provider-client";

export interface ScenarioResult {
  id: string;
  label: string;
  status: "pass" | "fail" | "info";
  detail: string;
}

export async function runScenarios(
  provider: Provider,
  appCheck: AppCheck,
  expectedAppId: string | null,
  onResult: (result: ScenarioResult) => void,
) {
  const report = (id: string, label: string, pass: boolean | null, detail: string) =>
    onResult({ id, label, status: pass === null ? "info" : pass ? "pass" : "fail", detail });

  const first = await requestToken(appCheck, "regular");
  const second = await requestToken(appCheck, "regular");
  report("cache", "Repeated getToken() returns cached token", first.token === second.token, `${second.durationMs.toFixed(1)} ms`);

  const forced = await requestToken(appCheck, "forced");
  report("force", "Forced refresh issues a new token", forced.token !== second.token, `${forced.durationMs.toFixed(0)} ms`);

  const regularA = await callEndpoint("regular", forced.token);
  const regularB = await callEndpoint("regular", forced.token);
  report("reuse", "Regular token accepted repeatedly", regularA.status === 200 && regularB.status === 200, `${regularA.status}, ${regularB.status}`);

  const appId = regularA.body && regularA.body.success ? regularA.body.appId : undefined;
  report("app", "Backend identifies originating app", !!expectedAppId && appId === expectedAppId, `${appId ?? "none"}`);

  const missing = await callEndpoint("regular");
  report("missing", "Missing token rejected", missing.status === 401, `${missing.status}`);

  const invalid = await callEndpoint("regular", "invalid.token.value");
  report("invalid", "Invalid token rejected", invalid.status === 401, `${invalid.status}`);

  const limited = await requestToken(appCheck, "limited-use");
  const useOnce = await callEndpoint("sensitive", limited.token);
  report("limited-first", "Limited-use token: first sensitive call", useOnce.status === 200, `${useOnce.status}`);

  const replay = await callEndpoint("sensitive", limited.token);
  report("limited-replay", "Limited-use token: replay rejected", replay.status === 409, `${replay.status}`);

  const fresh = await requestToken(appCheck, "limited-use");
  const useFresh = await callEndpoint("sensitive", fresh.token);
  report("limited-new", "New limited-use token accepted", useFresh.status === 200, `${useFresh.status}`);

  const racing = await requestToken(appCheck, "limited-use");
  const race = await Promise.all([1, 2, 3, 4, 5].map(() => callEndpoint("sensitive", racing.token)));
  const winners = race.filter((r) => r.status === 200).length;
  report("concurrent", "Concurrent requests: exactly one accepted", winners === 1, `${race.map((r) => r.status).join(", ")}`);

  const regularOnSensitive = await callEndpoint("sensitive", (await requestToken(appCheck, "forced")).token);
  report(
    "regular-on-sensitive",
    "Observation: unconsumed regular token on sensitive endpoint",
    null,
    `${regularOnSensitive.status} (${provider}); a valid unconsumed token is accepted once, then consumed`,
  );
}
