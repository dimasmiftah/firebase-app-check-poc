import type { Provider } from "@poc/shared";

export interface ProviderInfo {
  id: Provider;
  option: string;
  name: string;
  attestation: string;
}

export const PROVIDERS: Record<Provider, ProviderInfo> = {
  recaptcha: {
    id: "recaptcha",
    option: "Option A",
    name: "reCAPTCHA Enterprise",
    attestation: "Native provider: Firebase exchanges a reCAPTCHA Enterprise score-based token itself.",
  },
  cloudflare: {
    id: "cloudflare",
    option: "Option B",
    name: "Cloudflare Turnstile",
    attestation: "Custom provider: Turnstile token is verified by the local backend, which mints the App Check token.",
  },
};
