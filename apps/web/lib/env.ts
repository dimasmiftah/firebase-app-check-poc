import type { Provider } from "@poc/shared";

export const clientEnv = {
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  },
  recaptcha: {
    appId: process.env.NEXT_PUBLIC_RECAPTCHA_APP_ID ?? "",
    siteKey: process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? "",
  },
  cloudflare: {
    appId: process.env.NEXT_PUBLIC_CLOUDFLARE_APP_ID ?? "",
    siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "",
    action: process.env.NEXT_PUBLIC_TURNSTILE_ACTION ?? "",
  },
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
};

export function providerAppId(provider: Provider) {
  return clientEnv[provider].appId;
}

export function missingEnv(provider: Provider) {
  const missing: string[] = [];
  if (!clientEnv.firebase.apiKey) missing.push("NEXT_PUBLIC_FIREBASE_API_KEY");
  if (!clientEnv.firebase.authDomain) missing.push("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
  if (!clientEnv.firebase.projectId) missing.push("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  if (provider === "recaptcha") {
    if (!clientEnv.recaptcha.appId) missing.push("NEXT_PUBLIC_RECAPTCHA_APP_ID");
    if (!clientEnv.recaptcha.siteKey) missing.push("NEXT_PUBLIC_RECAPTCHA_SITE_KEY");
  } else {
    if (!clientEnv.cloudflare.appId) missing.push("NEXT_PUBLIC_CLOUDFLARE_APP_ID");
    if (!clientEnv.cloudflare.siteKey) missing.push("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
  }
  return missing;
}
