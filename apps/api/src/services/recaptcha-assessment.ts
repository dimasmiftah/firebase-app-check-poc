export interface RecaptchaAssessment {
  valid: boolean;
  invalidReason: string | null;
  score: number | null;
  reasons: string[];
  action: string | null;
  hostname: string | null;
}

export type AssessRecaptcha = (input: {
  projectId: string;
  siteKey: string;
  token: string;
  expectedAction?: string;
}) => Promise<RecaptchaAssessment>;

export function createRecaptchaAssessor(getAccessToken: () => Promise<string>): AssessRecaptcha {
  return async ({ projectId, siteKey, token, expectedAction }) => {
    const accessToken = await getAccessToken();
    const response = await fetch(
      `https://recaptchaenterprise.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/assessments`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ event: { token, siteKey, expectedAction } }),
      },
    );
    const body = (await response.json().catch(() => null)) as Record<string, any> | null;
    if (!response.ok) {
      throw new Error(body?.error?.message ?? `CreateAssessment failed with HTTP ${response.status}`);
    }

    return {
      valid: body?.tokenProperties?.valid === true,
      invalidReason: body?.tokenProperties?.invalidReason ?? null,
      score: typeof body?.riskAnalysis?.score === "number" ? body.riskAnalysis.score : null,
      reasons: body?.riskAnalysis?.reasons ?? [],
      action: body?.tokenProperties?.action ?? null,
      hostname: body?.tokenProperties?.hostname ?? null,
    };
  };
}
