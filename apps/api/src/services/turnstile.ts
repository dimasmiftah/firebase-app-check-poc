const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileResult {
  success: boolean;
  hostname?: string;
  action?: string;
  challenge_ts?: string;
  "error-codes": string[];
}

export function createTurnstileVerifier(secretKey: string, fetchImpl: typeof fetch = fetch) {
  return async function verifyTurnstile(token: string): Promise<TurnstileResult> {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: secretKey, response: token }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Siteverify responded with ${response.status}`);
    return (await response.json()) as TurnstileResult;
  };
}
