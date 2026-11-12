import { deleteApp, initializeApp } from "firebase/app";
import { initializeAppCheck, type AppCheck } from "firebase/app-check";
import type { Provider } from "@poc/shared";
import { createCloudflareProvider } from "./cloudflare";
import { clientEnv, providerAppId } from "./env";
import { createRecaptchaProvider } from "./recaptcha";

const shared: Partial<Record<Provider, AppCheck>> = {};

function build(provider: Provider, name: string, autoRefresh: boolean) {
  const app = initializeApp({ ...clientEnv.firebase, appId: providerAppId(provider) }, name);
  const appCheck = initializeAppCheck(app, {
    provider: provider === "recaptcha" ? createRecaptchaProvider() : createCloudflareProvider(),
    isTokenAutoRefreshEnabled: autoRefresh,
  });
  return { app, appCheck };
}

export function getAppCheckFor(provider: Provider) {
  const existing = shared[provider];
  if (existing) return existing;
  const { appCheck } = build(provider, provider, true);
  shared[provider] = appCheck;
  return appCheck;
}

export function createDisposableAppCheck(provider: Provider, name: string) {
  const { app, appCheck } = build(provider, name, false);
  return { appCheck, dispose: () => deleteApp(app) };
}
