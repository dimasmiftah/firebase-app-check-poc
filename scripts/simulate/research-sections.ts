const link = (label: string, href: string) => `<a href="${href}">${label}</a>`;

export function researchSection() {
  return `<h2>Market research: reCAPTCHA vs Turnstile</h2>
  <div class="note"><strong>Read with care.</strong> Gathered on 2026-11-12 from web search. All adoption figures come from third-party trackers that count different things, and most opinion pieces are vendor blogs. No independent 2026 measurement of bypass resistance was found, and no Reddit or Hacker News threads were retrievable, so "who trusts which" is not backed by community data here.</div>

  <h3>Adoption (directional only)</h3>
  <table>
    <thead><tr><th>Source</th><th>reCAPTCHA</th><th>Turnstile</th><th>What it counts</th></tr></thead>
    <tbody>
      <tr><td>${link("Zyte 2026", "https://www.zyte.com/sowa/2026/barriers/captcha")}</td><td>49.4%</td><td>39.4%</td><td class="small">Share among CAPTCHA deployments</td></tr>
      <tr><td>${link("WMTips", "https://www.wmtips.com/technologies/captchas/")}</td><td>67.1%</td><td>15.4%</td><td class="small">Global ranking among CAPTCHA services (hCaptcha 31%)</td></tr>
      <tr><td>${link("TechnologyChecker", "https://technologychecker.io/category/bot-detection-captcha")}</td><td>57.8%</td><td>4.2%</td><td class="small">Detection on live sites</td></tr>
    </tbody>
  </table>
  <ul>
    <li>reCAPTCHA leads in every source. Turnstile is growing fastest: TechnologyChecker shows it gaining about 14,600 domains in 30 days while reCAPTCHA lost ground.</li>
    <li>Country trackers such as ${link("Aguko (Lithuania)", "https://www.aguko.com/cat/captchas/lt")} show reCAPTCHA far ahead in individual markets.</li>
  </ul>

  <h3>What people say</h3>
  <ul>
    <li><strong>In favor of Turnstile:</strong> mostly invisible UX, privacy, free tier, light page weight. One developer reports about 40 ms blocking time versus about 200 ms for reCAPTCHA (${link("single anecdote", "https://ranti.dev/blog/migrating-from-recaptcha-to-turnstile")}, not a benchmark). Migration is documented as swapping the script, site key and verification URL (${link("Cloudflare guide", "https://developers.cloudflare.com/turnstile/migration/migrating-from-recaptcha")}).</li>
    <li><strong>In favor of reCAPTCHA:</strong> more mature risk scoring (a 0 to 1 score with Console thresholds) and a longer track record.</li>
    <li><strong>Concerns about Turnstile:</strong> VPN users being challenged or blocked, lock-in to the Cloudflare ecosystem, little public data on effectiveness against sophisticated bots. Cloudflare's docs list disabling a VPN as a troubleshooting step for its generic <code>600*</code> challenge errors, so VPN friction is plausible.</li>
    <li><strong>Bypass resistance:</strong> the only comparison found is a 2022 study by a competitor (${link("hCaptcha", "https://hcaptcha.uth.edu/blog/hcaptcha-vs-turnstile")}) saying paid bypass services were cheaper and faster against Turnstile than against reCAPTCHA v3. It is almost four years old and from a vendor with a competing product. Blogs say the bypass landscape changes week to week, without measurements (${link("example", "https://dev.to/vhub_systems_ed5641f65d59/cloudflare-turnstile-vs-hcaptcha-vs-recaptcha-v3-which-is-hardest-to-bypass-in-2026-5h17")}).</li>
  </ul>
  <p>Popularity is not effectiveness. In this PoC, Turnstile refused every browser launched by Playwright while reCAPTCHA let all of them through with a score of 0.9, but a real Chrome driven over CDP got tokens from both, all on one machine and one IP. That does not contradict the adoption numbers, and neither result should be generalized.</p>

  <h3>Turnstile widgets</h3>
  <p>A widget is a configuration, not the visible box: it holds a mode (Managed, Non-Interactive or Invisible), a label, a site key and a secret key, plus allowed hostnames (${link("Cloudflare docs", "https://developers.cloudflare.com/turnstile/concepts/widget/")}). The Free plan allows up to 20 widgets and 10 hostnames per widget. Listing a root domain also allows its subdomains (${link("hostname management", "https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/")}). For Indodana the plan is 3 widgets, one each for staging, sandbox and production, so each environment has its own secret key and analytics, and the backend hostname check stays per environment. That is well inside the Free limits. Cloudflare gives no official guidance on one widget versus several, so one widget per environment is a recommendation, not a rule.</p>`;
}

export function costSection() {
  return `<h2>Estimated monthly cost</h2>
  <div class="note"><strong>Assumptions.</strong> Single-use mode, so every protected request needs a fresh limited-use token. Production traffic is 100,000 protected requests per month, one token each, and a 10x scenario of 1,000,000 per month. Turnstile uses 3 widgets (staging, sandbox, production). Staging and sandbox traffic is not given, so it is shown as a sensitivity below. Prices were read from official pages on 2026-11-12 and should be rechecked before budgeting.</div>

  <h3>What one request costs in each path</h3>
  <table>
    <thead><tr><th>Step</th><th>reCAPTCHA Enterprise</th><th>Turnstile (custom provider)</th></tr></thead>
    <tbody>
      <tr><td>Client attestation</td><td>Firebase exchange creates 1 reCAPTCHA assessment (billable above the free quota)</td><td>Widget run, free</td></tr>
      <tr><td>Backend step</td><td>none</td><td>Siteverify call (free) and <code>createToken()</code> call to Firebase</td></tr>
      <tr><td>Verification</td><td><code>verifyToken(consume)</code> call</td><td><code>verifyToken(consume)</code> call</td></tr>
      <tr><td>Backend calls per request</td><td>1 Firebase call</td><td>3 outbound calls (about 300,000 per month, roughly 0.12 per second on average)</td></tr>
    </tbody>
  </table>

  <h3>Cost at 100,000 and 1,000,000 production requests per month</h3>
  <table>
    <thead><tr><th>Item</th><th>reCAPTCHA Enterprise</th><th>Turnstile</th></tr></thead>
    <tbody>
      <tr><td><strong>100,000 per month</strong> (base)</td><td><strong>about $8 per month</strong> (about $96 per year): 100,000 assessments fall in the 10,001 to 100,000 band, a flat fee in Google's ${link("billing documentation", "https://docs.cloud.google.com/recaptcha/docs/billing-information")}</td><td><strong>$0</strong>: Free plan, unlimited challenges, 3 of 20 widgets (${link("plans", "https://developers.cloudflare.com/turnstile/plans")})</td></tr>
      <tr><td><strong>1,000,000 per month</strong> (10x)</td><td><strong>about $900 to $1,000 per month</strong> (about $11,000 to $12,000 per year). Google bills $1 per 1,000 assessments above 100,000. Reading that as $8 plus $1 per 1,000 on the extra 900,000 gives about $908. A third-party summary shows $900 at 1,000,000, and charging $1 per 1,000 on every assessment would give $1,000. The documentation does not settle which applies.</td><td><strong>$0</strong>: the Free plan states unlimited challenges, so volume does not change the license cost</td></tr>
      <tr><td>Backend calls per month</td><td>100,000 at base, 1,000,000 at 10x (<code>verifyToken</code> only)</td><td>300,000 at base, 3,000,000 at 10x (Siteverify, <code>createToken</code>, <code>verifyToken</code>), about 1.2 per second on average at 10x</td></tr>
      <tr><td>Firebase App Check</td><td colspan="2">No-cost, subject to quotas and limits that vary by provider (${link("Firebase pricing", "https://firebase.google.com/pricing")})</td></tr>
    </tbody>
  </table>
  <p>At the base volume the license difference is about $8 per month, so cost alone should not decide between the two. At 10x it becomes material, roughly $900 to $1,000 per month in favor of Turnstile on license cost alone. The Turnstile path costs more in engineering and operations: Indodana runs the exchange endpoint and service account, and attestation was slower in this PoC (about 2 s versus about 0.6 s, low confidence, see the side by side table). At 10x those three Firebase and Cloudflare calls per request also make quota limits more likely to matter.</p>

  <h3>Sensitivity: staging and sandbox traffic on reCAPTCHA</h3>
  <p>Google's free allowance and bands are aggregated across the whole organization, all keys and projects. At the base volume, production alone is already at the top of the $8 band, so any extra assessments cross into the next band, billed at $1 per 1,000. The documentation does not say whether the $8 fee still applies in that band, so the base volume rows assume it does. At 10x production is already well inside the per-assessment band, so extra traffic simply adds $1 per 1,000.</p>
  <table>
    <thead><tr><th>Production per month</th><th>Non-production assessments per month</th><th>Estimated reCAPTCHA cost</th></tr></thead>
    <tbody>
      <tr><td rowspan="3">100,000</td><td>0</td><td>$8</td></tr>
      <tr><td>10,000</td><td>about $18</td></tr>
      <tr><td>50,000</td><td>about $58</td></tr>
      <tr><td rowspan="3">1,000,000</td><td>0</td><td>about $900 to $1,000</td></tr>
      <tr><td>10,000</td><td>add about $10</td></tr>
      <tr><td>50,000</td><td>add about $50</td></tr>
    </tbody>
  </table>

  <h3>What could change the estimate</h3>
  <ul>
    <li><strong>Existing reCAPTCHA Enterprise usage in the organization</strong> shares the same free quota and bands, so a real bill depends on total usage, not only this feature. Not known here.</li>
    <li><strong>Auto token refresh.</strong> Firebase documents that App Check creates an assessment each time a regular token refreshes (about twice an hour per active client at a 1 hour TTL). If the app also keeps a regular token alive besides limited-use tokens, assessments exceed one per request.</li>
    <li><strong>Pricing sources disagree.</strong> Google's own billing page gives a flat $8 for the 10,001 to 100,000 band. A third-party page lists about $90 at 100,000 and says the free tier was cut on 2026-04-02, which does not match Google's page. This estimate follows the official page.</li>
    <li><strong>Quotas at 10x.</strong> Firebase says App Check's default per-project quotas are not typically depleted, but the Turnstile path makes about 3,000,000 Firebase or Cloudflare calls per month at 10x. Check the quota page in the Cloud console and ask for an increase before launch if needed.</li>
    <li><strong>Not priced:</strong> compute for the exchange and verification calls on Hermes, any proxy or egress cost, and App Check quota limits for token creation and consumption at 100,000 requests per month. Firebase says default quotas are not typically depleted, but the quota page in the Cloud console should be checked. Replay protection (<code>consume</code>) is also documented as beta.</li>
  </ul>
  <p class="muted">Sources: ${link("Google reCAPTCHA billing", "https://docs.cloud.google.com/recaptcha/docs/billing-information")}, ${link("Firebase App Check overview", "https://firebase.google.com/docs/app-check")}, ${link("Firebase reCAPTCHA Enterprise provider", "https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider")}, ${link("Firebase pricing", "https://firebase.google.com/pricing")}, ${link("Cloudflare Turnstile plans", "https://developers.cloudflare.com/turnstile/plans")}, ${link("third-party reCAPTCHA pricing summary", "https://www.phpcaptcha.org/recaptcha-pricing")}.</p>`;
}
