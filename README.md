# Firebase App Check PoC: reCAPTCHA Enterprise vs Cloudflare Turnstile

Local-first comparison of two Firebase App Check attestation providers against one backend.

- **Option A**: native `ReCaptchaEnterpriseProvider`
- **Option B**: `CustomProvider` backed by Cloudflare Turnstile and a local token-exchange endpoint (`firebase-admin` `createToken()`)

Stack: Bun workspaces, Next.js (App Router) + Tailwind, Hono on Bun, Firebase JS SDK, Firebase Admin SDK, Vitest.

```
apps/web        Next.js dashboard (port 3000)
apps/api        Hono API (port 3001)
packages/shared Shared TypeScript types
```

## Quick start

```bash
bun install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# fill in both files (see Setup), then:
bun dev
```

Open http://localhost:3000. Missing credentials never crash the app: the dashboard and API report which variables are missing.

Checks: `bun run typecheck`, `bun run lint` (web), `bun run test`.

## Suggested baseline for a fair comparison

| Setting | Value |
|---|---|
| App Check token TTL | 30 min on both Firebase Web Apps (Console) |
| reCAPTCHA Enterprise risk threshold | 0.5 |
| Turnstile widget mode | Invisible (Cloudflare Dashboard) |
| `APP_CHECK_TTL_MINUTES` (API) | 30 |

The Cloudflare custom provider does **not** read the Console TTL: its TTL is whatever the backend passes to `createToken({ ttlMillis })`. This PoC sets it from `APP_CHECK_TTL_MINUTES` (clamped to 30 min - 7 days) so both providers match.

## Setup

### 1. Create a Firebase project
Firebase Console > **Add project** > follow the wizard (Analytics not needed). Use a personal project.

### 2. Register two Firebase Web Apps
Project overview > **Add app** > **Web** (`</>`). Create `recaptcha-app` and then repeat for `cloudflare-app`. Note each App ID (`1:123:web:abc`) from **Project settings > General > Your apps**. The `apiKey`, `authDomain`, `projectId` are shared and are shown in the SDK snippet.

### 3. Configure reCAPTCHA Enterprise
1. Google Cloud Console > **Security > reCAPTCHA Enterprise** (enable the API for the project when prompted; billing account may be required, free tier applies).
2. **Create key** > Platform **Website** > add domain `localhost` > choose the **score-based** (no challenge) key > create.
3. Copy the key ID into `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`.
4. Firebase Console > **Build > App Check > Apps** > select `recaptcha-app` > **reCAPTCHA Enterprise** > paste the site key > **Save**.

### 4. Set the risk threshold
App Check > Apps > `recaptcha-app` > **reCAPTCHA Enterprise** provider settings > **Minimum score threshold** = `0.5`.

### 5. Configure token TTL
App Check > Apps > select each app > provider settings > **Token time-to-live** = 30 minutes. Do this for `recaptcha-app`. For `cloudflare-app` the Console TTL is not used by the custom provider; the API's `APP_CHECK_TTL_MINUTES` controls it.

### 6. Register the Cloudflare app as a custom provider
App Check > Apps > `cloudflare-app` > **Custom** provider > save. (Required so tokens minted by `createToken()` for this app are accepted.)

### 7. Create a Cloudflare Turnstile widget
Cloudflare Dashboard > **Turnstile** > **Add widget** > hostnames: `localhost` > mode **Invisible** > Create. Copy the **site key** to `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and the **secret key** to `TURNSTILE_SECRET_KEY`.

### 8. Local development notes
- `localhost` is allowed by reCAPTCHA Enterprise keys and Turnstile widgets when added as a domain/hostname.
- Cloudflare's published dummy keys (`1x00000000000000000000AA`) report hostname `example.com`; to use them set `TURNSTILE_EXPECTED_HOSTNAME=example.com`. Real keys report `localhost`.
- To avoid reCAPTCHA failures on restricted networks you can use an App Check debug token (Firebase docs: App Check > Web > debug provider), but that bypasses the real provider and would invalidate the comparison.

### 9. Firebase Admin credentials
Project settings > **Service accounts** > **Generate new private key**. Copy `project_id`, `client_email`, `private_key` into `apps/api/.env`. Keep the private key in quotes; `\n` escapes are supported. Never commit it.

### 10. IAM for replay protection
`verifyToken(token, { consume: true })` needs the service account to hold **Firebase App Check Token Verifier** (`roles/firebaseappcheck.tokenVerifier`). The service account downloaded from the Firebase Console already has it per Firebase docs; if you use another service account, grant it in Google Cloud Console > **IAM & Admin > IAM**. Replay protection is beta, supports Node.js/Python Admin SDKs, and adds a network round trip per verification.

### 11. Populate environment variables

`apps/api/.env`: see [apps/api/.env.example](apps/api/.env.example).
`apps/web/.env.local`: see [apps/web/.env.example](apps/web/.env.example).

`FIREBASE_RECAPTCHA_APP_ID` / `NEXT_PUBLIC_RECAPTCHA_APP_ID` are the same value, as are the Cloudflare pair.

### 12. Run
`bun install`, then `bun dev` (starts API on :3001 and web on :3000). The web scripts run via `bun --bun` because Next.js 16 needs a recent runtime; no separate Node install is required.

### 13. Tests
`bun run test` runs Vitest in both workspaces.

## API

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /api/public` | none | |
| `GET /api/config` | none | non-secret config status for the dashboard |
| `GET /api/regular` | `X-Firebase-AppCheck` | `verifyToken(token)`; reusable |
| `POST /api/sensitive` | `X-Firebase-AppCheck` | `verifyToken(token, { consume: true })` |
| `POST /app-check/exchange` | Turnstile token in body | rate limited, returns App Check token |

Status codes: 401 missing/invalid/expired token, 403 unapproved Firebase app, 409 already consumed, 503 not configured. The originating app is derived from the verified token's `appId`, mapped to `recaptcha` or `cloudflare`; no client header is trusted.

Exchange: verifies via Cloudflare Siteverify, rejects failures and `timeout-or-duplicate` (reused/expired) tokens, checks `hostname` against `TURNSTILE_EXPECTED_HOSTNAME` and optionally `action`, then mints a token **only** for `FIREBASE_CLOUDFLARE_APP_ID`. There is no code path that issues tokens without successful attestation, and the body has no app ID field.

## Architecture

- **Native vs custom provider**: native providers are exchanged by Firebase's own servers. The custom provider calls our `getToken()` which must return `{ token, expireTimeMillis }`.
- **Lifecycle**: client obtains attestation, App Check token is cached by the SDK, refreshed automatically, sent in `X-Firebase-AppCheck`, verified by the backend.
- **Caching**: `getToken()` returns the cached token while valid; `getToken(appCheck, true)` forces a new exchange. The custom provider's `getToken` always performs fresh attestation, caching is the SDK's job.
- **Auto-refresh**: enabled via `isTokenAutoRefreshEnabled: true`. The SDK schedules refresh at roughly half the TTL, subject to SDK behavior. The dashboard logs observed token changes through `onTokenChanged`; no exact timestamp is assumed.
- **Expiration**: tokens expire at `exp`; the backend rejects them (covered by unit tests with mocks; not feasible live within a 30 minute TTL).
- **Replay protection**: purely server-side. `getLimitedUseToken()` does not produce an identifiable token format; the backend consumes tokens via `consume: true`. An unconsumed regular token is therefore also accepted once by the sensitive endpoint. The live checks record this as an observation.
- **Multi-app**: both Firebase Web Apps hit the same API, which identifies them by `appId`.
- **Turnstile mode**: the widget is rendered explicitly with `execution: "execute"` and `appearance: "interaction-only"` in a fixed corner container. Invisible/non-interactive modes work end to end. Managed mode may show a challenge: because this code renders the widget itself, the challenge is shown in that container, but Firebase App Check has no built-in awareness of interactive challenges (`getToken` simply waits, 60 s timeout). Treat Managed as feasible-but-unsupported-by-Firebase.

## Comparison

Facts verified in this session against the Firebase docs: custom provider `getToken` shape, `consume: true` behavior and IAM role, replay protection beta limits. Everything else in the table is **unverified assumption** from general knowledge; confirm on the official pages before relying on it.

| Topic | reCAPTCHA Enterprise | Cloudflare Turnstile |
|---|---|---|
| Implementation complexity | Low (native provider, Console config) | Higher (exchange endpoint, rate limiting, hostname checks, you operate a token issuer) |
| Pricing | Assumption: free monthly assessment quota, then paid; billing account required | Assumption: free Turnstile tier; Firebase App Check itself is free |
| Free-tier limits | Assumption: assessment quota per month | Assumption: widget count/plan limits |
| Attestation | Score-based, Google-managed | Cloudflare challenge, verified by your backend |
| Challenge support | Score-based key, no challenge | Managed/non-interactive/invisible; interactive not handled by Firebase |
| Risk-score visibility | Score/threshold in Console and Cloud assessments | Pass/fail from Siteverify |
| Custom thresholds | Yes (Console minimum score) | Not applicable; you implement policy in the exchange endpoint |
| Token caching | SDK | SDK |
| Replay protection | `consume: true` + limited-use tokens | same |
| Operational maintenance | Low | You run and secure the issuer |

## Benchmarks

Run **Benchmark** on each dashboard (default 5 samples; the exchange endpoint allows 60 requests/min per client by default). Metrics: initial attestation (fresh Firebase app each sample), cached token retrieval, forced refresh, limited-use token, regular API round trip, replay-protected round trip, with backend `verifyToken()` time reported separately by the API. Results are stored in the browser (localStorage) and compared at `/benchmark`. No results are bundled with this repository.

## Manual verification checklist

1. Both dashboards: **Run checks** and confirm all PASS (the Observation line is INFO).
2. Cloudflare: confirm `/app-check/exchange` fails for an invalid Turnstile token (Benchmark > failed attestation section).
3. Leave a dashboard open past ~15 minutes and look for entries in the automatic refresh log.
4. reCAPTCHA failed attestation: lower the key's threshold or block the reCAPTCHA domain and observe the error.
5. Confirm the service account has the Token Verifier role if `/api/sensitive` returns 401/permission errors.

## Known limitations

- Live behavior requires real Firebase, reCAPTCHA Enterprise and Turnstile credentials; unit tests use mocks only.
- Rate limiting is in-memory and per-process.
- Firebase replay protection is beta.
- Not verified against live services in the authoring environment: all external behavior above is pending your credentials.

## Official documentation

- https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
- https://firebase.google.com/docs/app-check/web/custom-provider
- https://firebase.google.com/docs/app-check/custom-resource-backend
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- https://developers.cloudflare.com/turnstile/extensions/google-firebase/
