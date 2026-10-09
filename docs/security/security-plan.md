# TestReady — Security Plan

_Stage 7 security audit and hardening. Applies to `nextjs-app/` (Next.js 14 on Netlify, Supabase, Azure AI Foundry)._

---

## 1. Deploy order (read first)

1. **Run `nextjs-app/supabase/rls-policies.sql` in the Supabase SQL Editor.** It is idempotent. It is also saved as `supabase/migrations/0003_security_hardening.sql`.
2. **Then deploy the code.** The new rate limiter calls `rate_limit_check()`. Auth, AI and upload endpoints **fail closed**: without the function they return `503 SERVICE_UNAVAILABLE`, which means nobody can log in.
3. Apply the Supabase dashboard settings in §6.
4. Run `RUN_INTEGRATION=1 npm run test:integration` against staging. It includes the new X2 column-privilege suite.
5. In a browser, smoke-test HEIC photo upload, PDF report upload, worksheet download and the review crops. This confirms the new Content-Security-Policy blocks nothing legitimate.

No new environment variables are required.

---

## 2. Security surfaces

| Surface | Where | Control |
|---|---|---|
| Page access | `src/middleware.ts`, `(app)/layout.tsx` | Session refresh plus redirect to `/login` for `/children` and `/account`. Signed-in users on `/login` or `/signup` go to `/children`. Re-checked server-side in the layout. |
| API auth | `lib/api/route.ts` → `lib/security/authGuard.ts` | `auth.getUser()` (verified with Supabase Auth, never `getSession()`) on every `auth: 'user'` route. |
| CSRF | `authGuard.assertSameOriginRequest` | State-changing requests must carry a same-site `Origin` (or a non-cross-site `Sec-Fetch-Site`). Bodies must be `application/json`. |
| Input validation | `route.ts` and the Zod schemas in `lib/schemas/*` (re-exported by `lib/security/inputValidator.ts`) | Params, query and body are validated before any logic runs. Failures return `422 VALIDATION_ERROR`. |
| Rate limiting | `lib/security/rateLimiter.ts` plus the `rate_limit_events` table | Sliding window, service role only (see §4). |
| AI calls | `lib/foundry/client.ts` (the only entry point to the agent) | Input schema, prompt-injection screening, input size cap, output token cap, output schema validation. |
| Parent-typed text sent to the AI | Child create/update, report create/confirm | `sanitizeForLLM()` returns `400 PROMPT_INJECTION`. |
| File uploads | `uploads.sign` → `validateFileUpload()`; `uploads.complete` → magic-byte sniffing | Extension blocklist → allowlist → MIME → size. The real bytes must match the declared type. Private bucket, signed URLs. |
| Data ownership | Every service | An RLS-scoped read (`requireChild`, `loadCycle`, `loadWorksheet`, …) comes before every service-role write. All were verified. |
| Database | `docs/specs/supabase-schema.sql` plus `supabase/rls-policies.sql` | RLS on every table, column-level write grants, service-only functions. |
| Storage | `uploads` and `worksheets` buckets | Private. Owner-folder read policies. Writes only via service role or signed upload URLs. Signed read URLs last 900 s, with a `DISABLE_SIGNED_URLS` kill switch. |
| Background jobs | `netlify/functions/run-job-background.ts` | HMAC-SHA256 over the job id with `JOB_SIGNING_SECRET` and a timing-safe compare. `claim_job` is atomic, so a replay cannot double-run a job. |
| Secrets | `lib/supabase/service.ts`, `lib/foundry/env.ts` | Server-only (`import 'server-only'`). Only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, site URL, support email and analytics key are public. |
| Logs | `lib/logger` | pino redaction of child data, emails, credentials, tokens, signed URLs and signatures. User ids are hashed. |
| Browser | `next.config.mjs` | CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP, and `Cache-Control: no-store` on `/api/*`. |

---

## 3. Issues found and fixed

| # | Severity | Issue | Fix |
|---|---|---|---|
| 1 | **Critical** | `next@14.2.5` has the middleware authorization bypass (CVE-2025-29927, `x-middleware-subrequest`) plus cache-poisoning, SSRF and DoS advisories. | Upgraded to `next@14.2.35` and `eslint-config-next@14.2.35`. |
| 2 | **High** | `sharp@0.33` (libvips/libheif CVEs) decodes **untrusted uploaded photos** on the server. | Upgraded to `sharp@0.35.5`. Smoke-tested against `computeQualityScore` and the crop pipeline. |
| 3 | **High** | A parent could call the Supabase REST API directly with the anon key and insert or update `reports` (`placement`, `confirmed_values`). This bypassed Zod validation, the grade/placement check and confirmation immutability. These values go to the AI, so this was a prompt-injection path. | Revoked all parent writes on `reports` and dropped `reports_insert_manual` and `reports_update_own`. The API writes with the service role after an RLS ownership check (`reports.service.ts`). |
| 4 | **High** | Every `children` column was writable directly, including `current_cycle` (resetting it to 0 bypasses the grade lock and causes cycle-number collisions) and `profile_summary`. | Column grants. Insert allows `user_id, nickname, grade`. Update allows `nickname, grade, lexile`, the reading baseline and its streaks (exactly what the app writes). |
| 5 | **Medium** | Parent-typed text sent to the AI was not screened. A 30-character nickname fits "ignore previous instructions". The system prompt did not say that image and input text is data. | `lib/security/promptInjectionGuard.ts`: `sanitizeForLLM()` in the child and report routes (`400 PROMPT_INJECTION`), and `assertAgentInputSafe()` before every AI call. Added an "Untrusted content" section to `prompts/v1.0/system.md` (prompt v1.0.1). |
| 6 | **Medium** | The login brute-force limit was opt-in. The browser called `/api/auth/precheck` and then Supabase directly, so a script could skip the limit. | Server-side `POST /api/auth/login` with 10/min per IP plus 10 per 15 min per email. Responses are uniform (`401 INVALID_CREDENTIALS`, no account enumeration). Added server-side `POST /api/auth/logout`. |
| 7 | **Medium** | The rate limiter used a fixed window (2× burst at boundaries) and failed open everywhere. AI-cost endpoints had only per-minute limits (`reports.create` defaulted to 30/min), with no hourly or daily caps. `RATE_LIMIT_ENABLED=false` was honoured in production. | Sliding window (`rate_limit_check`, advisory-locked, exact `Retry-After`). Fails closed for auth, AI and upload buckets. Added hourly AI caps and a daily upload cap. The switch is ignored in production. |
| 8 | **Medium** | Login CSRF: `route()` parsed any `Content-Type` as JSON and had no Origin check. A cross-site `text/plain` form could sign a victim into an attacker's account. | `assertSameOriginRequest()` in the pipeline. Verified: cross-site → 403, `text/plain` → 415. |
| 9 | **Medium** | `pdfjs-dist@3` (CVE-2024-4367: script execution from a malicious PDF) opens parent-supplied PDFs in the browser. | `getDocument({ isEvalSupported: false })`, the documented mitigation. |
| 10 | **Medium** | The `uploads_objects_insert_own` storage policy let a parent upload any object into their folder outside the slot, quota and type checks. | Dropped. Uploads use signed upload URLs, which don't need it. |
| 11 | Low | `profiles.email` and `terms_accepted_at` (the consent record) were user-writable. | Update is granted only on `paper_size` and `locale`. |
| 12 | Low | The `feedback_insert_own` policy didn't check worksheet or cycle ownership. | Policy dropped. The API writes with the service role after an ownership check. |
| 13 | Low | `graded_items` model-output columns (`method_evidence`, `method_sound`) were parent-writable. | Update is granted only on the confirmation columns. Length check added on `parent_answer`. |
| 14 | Low | There was no Content-Security-Policy or COOP, and no explicit no-store on API responses. | Added (see §2). |
| 15 | Low | Log redaction missed `signedUrl`, `uploadUrl`, `access_token`, `refresh_token`, `secret`, `signature` and `apiKey`. | Extended. Verified with pino. |
| 16 | Low | Uploads checked only the declared MIME type, not the filename. | `validateFileUpload()`: blocklist (exe, js, php, zip, sh, svg, html, …), then allowlist, then extension/MIME agreement, then size. |
| 17 | Low | The `anon` role still held table privileges (RLS blocked them, but this is defense in depth). | `revoke all on all tables in schema public from anon`. Service-only functions re-revoked. |
| 18 | Info | Validation errors returned 400. | Now `422 VALIDATION_ERROR`. The client keys off `error.code`, so nothing else changed. |

---

## 4. Rate limits

| Bucket | Limit | Keyed by | On limiter outage |
|---|---|---|---|
| `auth` (login, sign-up, forgot password, resend) | 10 / minute | IP (hashed) | refuse |
| `auth.email` (login) | 10 / 15 minutes | email (hashed) | refuse |
| AI endpoints, each one (`reports.create`, `reports.confirm`, `diagnoses.start`, `worksheets.start`, `worksheets.regenerate`, `submissions.create`, `cycles.finalize`, `jobs.retry`) | 10 / minute and 5 / hour | user | refuse |
| `ai.hourly` (all AI endpoints together) | 20 / hour (one practice cycle uses about 5) | user | refuse |
| `uploads.sign` | 20 / minute | user | refuse |
| `uploads.daily` | 20 upload batches / day (a batch is up to 5 pages or 4 photos) | user | refuse |
| Everything else | 120 reads / 30 writes per minute, or the route's own value | user, else IP | allow and log |

These sit on top of the business caps already in place: a daily cycle cap, one regeneration per cycle, 3 job attempts, 20 open upload slots per hour, and per-job dedupe keys.

---

## 5. Files

**Created**
- `src/lib/security/authGuard.ts`: `getAuthenticatedUser()`, `requireAuth()` (user, or a ready 401 response), `assertSameOriginRequest()`
- `src/lib/security/rateLimiter.ts`: `RATE_LIMITS`, `aiRouteLimits()`, `checkRateLimit()`, `enforceRateLimits()`, subject pseudonymisation
- `src/lib/security/promptInjectionGuard.ts`: `sanitizeForLLM()`, `sanitizeFieldsForLLM()`, `detectPromptInjection()`, `assertAgentInputSafe()`
- `src/lib/security/tokenLimiter.ts`: file size, page count, text length and AI input size ceilings, plus validators
- `src/lib/security/inputValidator.ts`: `validateFileUpload()` and re-exports of every Zod schema
- `src/app/api/auth/login/route.ts`, `src/app/api/auth/logout/route.ts`
- `supabase/rls-policies.sql`, `supabase/migrations/0003_security_hardening.sql`
- `tests/unit/security/*.test.ts` (72 tests). The X2 suite was added to `tests/integration/rls.test.ts`.

**Modified**
- `src/lib/api/route.ts`: CSRF step, delegates auth and rate limiting to `lib/security`, multi-rule limits, logs security refusals
- `src/lib/errors/codes.ts`: `INVALID_CREDENTIALS`, `FORBIDDEN`, `PROMPT_INJECTION`, `UNSUPPORTED_CONTENT_TYPE`, `SERVICE_UNAVAILABLE`; `VALIDATION_ERROR` → 422
- `src/lib/foundry/client.ts`: injection screen and input-size cap before every AI call
- `src/lib/reports/reports.service.ts`: manual-report insert and confirmation update use the service role after the ownership check
- `src/lib/uploads/uploads.service.ts`: `validateFileUpload()`
- `src/lib/jobs/errors.ts`: `PROMPT_INJECTION` is not retryable
- `src/lib/privacy/retention.ts`: purges `rate_limit_events` older than 2 days
- `src/lib/logger/index.ts`: wider redaction
- `src/lib/client/api.ts`, `src/components/auth/LoginForm.tsx`, `src/components/layout/LogoutButton.tsx`: server-side login and logout
- `src/lib/client/images/pdf-to-images.ts`: PDF.js eval disabled
- Route handlers: children (POST, PATCH), reports (create, confirm), diagnoses, worksheets (start, regenerate), submissions, finalize, jobs retry, uploads sign, auth precheck
- `prompts/v1.0/system.md` and `prompts/VERSION` (1.0.1); `src/lib/foundry/prompts.generated.ts` was regenerated
- `next.config.mjs`: CSP, COOP, API no-store
- `package.json` / `package-lock.json`: next, eslint-config-next, sharp, postcss
- `../.env.example` (`RATE_LIMIT_ENABLED` note), `../docs/specs/supabase-schema.sql` (pointer to the hardening SQL)

---

## 6. Supabase dashboard checklist (manual)

Authentication → Providers → Email:
- [ ] **Confirm email** ON
- [ ] **Secure email change** ON (confirm on both addresses)
- [ ] Minimum password length **10** (matches the app's schema). Turn on leaked-password protection if your plan has it.

Authentication → Sessions / Settings:
- [ ] **Refresh token rotation** ON, reuse interval 10 s
- [ ] JWT expiry 3600 s (default)
- [ ] Optional: inactivity timeout or time-box for sessions

Authentication → URL configuration:
- [ ] **Site URL** = production `NEXT_PUBLIC_SITE_URL`
- [ ] **Redirect URLs** allow only `https://<prod-domain>/auth/callback`, the Netlify preview pattern if used, and `http://localhost:3000/auth/callback`. This stops `emailRedirectTo` being pointed elsewhere.

Authentication → Rate limits. The anon key is public, so `/auth/v1/*` can be called without the app:
- [ ] Sign-ups / sign-ins: keep the defaults or lower them (for example 30 per 5 min per IP)
- [ ] Emails sent: the default is fine for MVP traffic

Password reset: the flow is `/forgot-password` → email → `/auth/callback?next=/reset-password` → `updateUser`. `safeNext()` blocks open redirects. Nothing to change.

---

## 7. Outstanding items

| Item | Why it's open | Suggested action |
|---|---|---|
| Next.js 14.x residual advisories | Fixes exist only in Next 15/16. The affected features (server actions, rewrites, `images.remotePatterns`, self-hosted image cache) are **not used** here. | Plan a Next 15 upgrade, then re-run `npm audit`. |
| `pdfjs-dist@3` | Mitigated with `isEvalSupported: false`. | Upgrade to `pdfjs-dist@4.10+` (ESM worker path change in `pdf-to-images.ts`). |
| `canvas` / `tar` audit entries | An optional `pdfjs-dist@3` dependency that is **not installed** (aliased to `false` in webpack). | Goes away with the PDF.js upgrade. |
| Sign-up, forgot password and resend confirmation still call Supabase Auth from the browser | They pass the `auth` IP limiter via `/api/auth/precheck`, and Supabase's own limits apply. | Optionally move them server-side, like login. |
| Prompt changed (v1.0.1) | The system prompt gained an "Untrusted content" section. | Run `npm run eval` / `eval:gate`, including suite E16 (adversarial), before release. |
| Legacy limiter | `rate_limits` and `rate_limit_hit()` are no longer used. They were kept for rollback. | Drop both after a few days on the new code. |
| CSP strength | `'unsafe-inline'` (Next bootstrap) and `'unsafe-eval'` (heic2any) are required today. | Add nonce-based CSP via middleware. Load heic2any in a worker or replace it. |
| Integration tests | They need a live project with the SQL applied. They were not run as part of this change. | Run `RUN_INTEGRATION=1 npm run test:integration` on staging. |

**Not applicable to TestReady:** the template's chat security (contract and session ownership, `MAX_CHAT_HISTORY`) and `.pdf`/`.docx` uploads. There is no chat feature, and PDFs are converted to images in the browser. The equivalent ownership controls are the RLS-scoped `requireChild`, `loadCycle` and `loadWorksheet` checks before every service-role write. Each one was audited.
