import { Hono } from "hono";
import type { ApiSuccess } from "@poc/shared";
import type { Deps } from "../app";
import { requireAppCheck, type AppCheckVariables } from "../middleware/app-check";

export function regularRoute(deps: Deps) {
  const route = new Hono<{ Variables: AppCheckVariables }>();

  route.get("/", requireAppCheck(deps, { consume: false }), (c) => {
    const { appId, provider, verifyMs } = c.get("appCheck");
    const body: ApiSuccess = { success: true, appId, provider, verifyMs, message: "Valid reusable token" };
    return c.json(body);
  });

  return route;
}
