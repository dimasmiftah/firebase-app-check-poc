import { Hono } from "hono";
import type { Deps } from "../app";

export function diagRoute(deps: Deps) {
  const route = new Hono();

  route.post("/recaptcha-score", async (c) => {
    if (!deps.assessRecaptcha) {
      return c.json({ success: false, error: "not_configured", message: "Firebase Admin credentials are missing" }, 503);
    }

    const body = (await c.req.json().catch(() => null)) as {
      token?: unknown;
      siteKey?: unknown;
      expectedAction?: unknown;
    } | null;
    if (typeof body?.token !== "string" || typeof body.siteKey !== "string") {
      return c.json({ success: false, error: "invalid_request", message: "token and siteKey are required" }, 400);
    }

    try {
      const assessment = await deps.assessRecaptcha({
        projectId: deps.config.firebase.projectId,
        siteKey: body.siteKey,
        token: body.token,
        expectedAction: typeof body.expectedAction === "string" ? body.expectedAction : undefined,
      });
      return c.json({ success: true, ...assessment });
    } catch (error) {
      const message = error instanceof Error ? error.message : "CreateAssessment failed";
      return c.json({ success: false, error: "assessment_failed", message }, 502);
    }
  });

  return route;
}
