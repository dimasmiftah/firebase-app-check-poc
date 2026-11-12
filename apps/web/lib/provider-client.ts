import { getLimitedUseToken, getToken, type AppCheck } from "firebase/app-check";

export type TokenKind = "regular" | "forced" | "limited-use";

export async function requestToken(appCheck: AppCheck, kind: TokenKind) {
  const startedAt = performance.now();
  const result = kind === "limited-use" ? await getLimitedUseToken(appCheck) : await getToken(appCheck, kind === "forced");
  const durationMs = performance.now() - startedAt;
  if ("error" in result && result.error) throw result.error;
  return { token: result.token, durationMs };
}
