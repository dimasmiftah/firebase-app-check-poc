import { createApp } from "./app";
import { loadConfig } from "./config";
import { createFirebaseAdmin } from "./firebase-admin";
import { createRecaptchaAssessor } from "./services/recaptcha-assessment";
import { createTurnstileVerifier } from "./services/turnstile";

const { config, missing } = loadConfig(process.env);
const appCheckReady = missing.firebase.length === 0 && missing.apps.length === 0;
const exchangeReady = appCheckReady && missing.turnstile.length === 0;

const notConfigured = async (): Promise<never> => {
  throw new Error("Not configured");
};

const admin = appCheckReady ? createFirebaseAdmin(config) : null;

const app = createApp({
  config,
  missing,
  appCheckReady,
  exchangeReady,
  verifyAppCheckToken: admin?.verifyAppCheckToken ?? notConfigured,
  createAppCheckToken: admin?.createAppCheckToken ?? notConfigured,
  assessRecaptcha: admin ? createRecaptchaAssessor(admin.getAccessToken) : undefined,
  verifyTurnstile: exchangeReady ? createTurnstileVerifier(config.turnstile.secretKey) : notConfigured,
});

const missingAll = [...missing.firebase, ...missing.apps, ...missing.turnstile];
if (missingAll.length > 0) {
  console.warn(`[api] Missing configuration: ${missingAll.join(", ")} (see apps/api/.env.example)`);
}
console.log(`[api] Listening on http://localhost:${config.port}`);

export default { port: config.port, fetch: app.fetch };
