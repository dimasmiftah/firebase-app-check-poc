export interface DecodedClaims {
  iat?: number;
  exp?: number;
  sub?: string;
  aud?: string[];
  iss?: string;
}

export function decodeJwtPayload(token: string): DecodedClaims | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as DecodedClaims;
  } catch {
    return null;
  }
}
