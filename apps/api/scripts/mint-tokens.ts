import { loadConfig } from "../src/config";
import { createFirebaseAdmin } from "../src/firebase-admin";

const count = Number(process.argv[2] ?? 1);
const { config, missing } = loadConfig(process.env);

if (missing.firebase.length > 0 || missing.apps.length > 0) {
  console.error(`Missing configuration: ${[...missing.firebase, ...missing.apps].join(", ")}`);
  process.exit(1);
}

const admin = createFirebaseAdmin(config);
const ttlMillis = config.ttlMinutes * 60_000;
const tokens: string[] = [];
for (let i = 0; i < count; i++) {
  tokens.push((await admin.createAppCheckToken(config.apps.cloudflare, ttlMillis)).token);
}
console.log(JSON.stringify(tokens));
