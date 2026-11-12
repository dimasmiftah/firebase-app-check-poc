import { Hono } from "hono";
import type { ApiSuccess } from "@poc/shared";
import type { Deps } from "../app";
import { requireAppCheck, type AppCheckVariables } from "../middleware/app-check";

export function sensitiveRoute(deps: Deps) {
  const route = new Hono<{ Variables: AppCheckVariables }>();

  route.post("/", requireAppCheck(deps, { consume: true }), (c) => {
    const { appId, provider, verifyMs } = c.get("appCheck");
    const body: ApiSuccess = { success: true, appId, provider, verifyMs, message: "Token consumed, replay protected" };
    return c.json(body);
  });

  return route;
}
