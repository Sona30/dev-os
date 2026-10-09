# 00 — Overview, Shared Conventions and Spec Index

Source of truth: `docs/engineering/engineering-doc.md` (EDD). PRD: `docs/TestReady_PRD_v2.md`. This file defines everything the other specs share. If a spec contradicts this file, this file wins.

## 1. Spec index

| File | What it specifies |
|---|---|
| `supabase-schema.sql` | Runnable SQL: enums, tables, triggers, RPCs, RLS, Storage buckets and policies |
| `../../.env.example` | Every environment variable, grouped by service |
| `01-auth-and-profiles.md` | Sign-up, login, sessions, middleware, profile settings |
| `02-children.md` | Child profiles, Child Profile payload, delete |
| `03-uploads.md` | Signed uploads, client-side image processing, validation, quality gates |
| `04-jobs-framework.md` | Async job pattern on Netlify, polling, retries, reaper |
| `05-foundry-integration.md` | Agent, knowledge base, prompts, schemas, retries, cost accounting |
| `06-report-parsing.md` | Report intake, parse job, parent confirmation |
| `07-gap-analysis.md` | Skills catalogue, diagnosis job, Screen 2 gap view |
| `08-worksheet-generation.md` | Planner, generation, verification, dedupe, PDFs, regeneration |
| `09-grading-and-review.md` | Photo grading, review queue, confirmation |
| `10-calibration-engine.md` | Deterministic mastery and two-axis recalibration |
| `11-results-and-progress.md` | Results page, dashboard, disclosures |
| `12-entitlements-and-paywall.md` | Free diagnostic, caps, paywall stub, Stripe (Phase 2) |
| `13-privacy-and-retention.md` | Data minimisation, retention, deletion, policy pages |
| `14-observability-and-cost.md` | Logging, usage events, cost alerts, monitors |
| `15-evaluation-suite.md` | AI evaluation harness, datasets, release gates |
| `16-frontend-foundation.md` | App shell, routing, design tokens, shared components, a11y |

Build order (matches EDD §10): 01 → 02 → 04 → 03 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12 → 13 → 14 → 15, with 16 built alongside 01.

## 2. Stack versions and libraries

| Concern | Choice |
|---|---|
| Runtime | Node 20 LTS, TypeScript 5 (`strict`, `noUncheckedIndexedAccess`) |
| Framework | Next.js 14 App Router |
| UI | Tailwind CSS, Radix primitives (shadcn/ui style), `lucide-react` icons |
| Data fetching | `@tanstack/react-query` v5 |
| Client state | `zustand` (intake wizard draft only) |
| Forms / validation | `react-hook-form`, `zod`, `@hookform/resolvers` |
| Supabase | `@supabase/supabase-js`, `@supabase/ssr` |
| Azure | `@azure/ai-projects`, `@azure/identity` |
| Images | `sharp` (server), `pdfjs-dist` and `heic2any` (browser) |
| PDF | `@react-pdf/renderer` |
| Math | `mathjs` (restricted scope) |
| Logging | `pino` |
| Tests | `vitest`, `fast-check`, `msw`, `@playwright/test`, `axe-core` |

## 3. Project-wide constants (`src/lib/constants.ts`)

```ts
export const MAX_ITEMS_PER_SHEET = 10;
export const MIN_ITEMS_PER_SHEET_FALLBACK = 6;
export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 10_485_760);
export const MAX_REPORT_PAGES = 5;
export const MAX_SHEET_PAGES = 4;
export const IMAGE_LONG_EDGE_PX = 2000;
export const SIGNED_URL_TTL_SECONDS = Number(process.env.SIGNED_URL_TTL_SECONDS ?? 900);
export const UPLOAD_RETENTION_DAYS = Number(process.env.UPLOAD_RETENTION_DAYS ?? 30);
export const EXTRACTION_CONFIDENCE_THRESHOLD = Number(process.env.EXTRACTION_CONFIDENCE_THRESHOLD ?? 0.85);
export const HISTORY_WINDOW_CYCLES = 4;               // FR-08
export const MAX_REGENERATIONS_PER_CYCLE = 1;         // FR-20
export const MAX_JOB_ATTEMPTS = 3;
export const JOB_POLL_INTERVAL_MS = [2000, 2000, 3000, 5000];  // last value repeats
export const ALLOWED_IMAGE_MIME = ['image/png','image/jpeg','image/webp','image/gif','image/heic','image/heif'] as const;
export const AGENT_IMAGE_MIME = ['image/png','image/jpeg','image/webp','image/gif'] as const; // HEIC is converted before reaching the model (FR-02)
export const READING_BANDS = ['R1','R2','R3','R4'] as const;
export const MATH_LEVELS = [1,2,3,4] as const;
export const DISCLOSURE = 'Practice support, not an official assessment. Ask your child\'s teacher for the full picture.'; // FR-19
export const AI_DISCLOSURE = 'Powered by AI. Please review any answers we flag.';
```

## 4. Request pipeline (all route handlers)

Every handler is created with `route({ auth, rateLimit, body?, query?, params? }, handler)` in `src/lib/api/route.ts`. Execution order is fixed:

1. Assign `requestId` (`crypto.randomUUID()`), attach to a child logger.
2. **Auth** (`auth: 'user' | 'none' | 'stripe'`). `user` → `supabase.auth.getUser()` (never `getSession()` for authorisation). Failure → `401 UNAUTHENTICATED`.
3. **Rate limit** via RPC `rate_limit_hit(key, windowSeconds, max)` (service role). Key = `{routeName}:{userId or ip}`. Exceeded → `429 RATE_LIMITED` with `Retry-After`.
4. **Validation**: zod parse of params, query, body. Unknown keys rejected (`.strict()`). Failure → `400 VALIDATION_ERROR` with `details: { fieldErrors }`.
5. **Handler** runs. Thrown `AppError` becomes the error envelope; any other error becomes `500 INTERNAL` (message "Something went wrong. Please try again.") and is logged with stack and `requestId`.
6. Response header `x-request-id` always set.

Default rate limits (per user unless noted): reads 120/min; mutations 30/min; `POST /api/uploads/sign` 20/min; job-creating routes 10/min; `/api/auth/*` by IP 10/min; webhook none (signature).

## 5. Error model

```ts
export class AppError extends Error {
  constructor(public code: ErrorCode, public status: number, public userMessage: string, public details?: unknown) { super(code); }
}
// Wire format
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": { } } }
```

| Code | HTTP | User-facing message |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Please sign in to continue. |
| `VALIDATION_ERROR` | 400 | Please check the highlighted fields. |
| `NOT_FOUND` | 404 | We couldn't find that. |
| `CONFLICT` | 409 | That conflicts with the current state. Refresh and try again. |
| `CHILD_EXISTS` | 409 | You already have a child with that name. |
| `CHILD_LIMIT` | 422 | Your plan allows up to {n} children. |
| `GRADE_LOCKED` | 409 | Grade can't be changed after the first worksheet. |
| `CONTRADICTORY_INPUT` | 422 | That placement doesn't match the grade you chose. |
| `NOT_PARSED` | 409 | We're still reading the report. |
| `REPORT_NOT_CONFIRMED` | 409 | Please confirm the report values first. |
| `PAYWALL` | 402 | Your free worksheet has been used. |
| `DAILY_CAP` | 429 | You've reached today's worksheet limit. Try again tomorrow. |
| `REGEN_LIMIT` | 409 | You can regenerate a worksheet once per cycle. |
| `ALREADY_GRADED` | 409 | This sheet has already been graded. |
| `REVIEW_PENDING` | 409 | Some answers still need your confirmation. |
| `FILE_TOO_LARGE` | 413 | That file is larger than 10 MB. |
| `UNSUPPORTED_MEDIA` | 415 | We can't read that file type. |
| `PHOTO_QUALITY` | 422 | The photo is too blurry, dark or cut off. Please retake it. |
| `SHEET_MISMATCH` | 422 | This photo doesn't match the worksheet. |
| `JOB_RETRY_LIMIT` | 409 | We've tried this three times. Please contact support. |
| `AI_UNAVAILABLE` | 503 | Our assistant is busy. Please try again in a minute. |
| `AI_INVALID_OUTPUT` | 502 | We couldn't finish this step. Please try again. |
| `RATE_LIMITED` | 429 | Too many requests. Please wait a moment. |
| `INTERNAL` | 500 | Something went wrong. Please try again. |

## 6. Supabase clients (`src/lib/supabase/`)

| File | Export | Key | Use |
|---|---|---|---|
| `browser.ts` | `createBrowserClient()` | anon | Client Components: auth only, plus Storage upload via signed URL |
| `server.ts` | `createServerClient()` | anon + cookies | Route handlers and Server Components; **RLS applies** |
| `service.ts` | `createServiceClient()` | service role | Repositories for derived data, jobs, Storage writes; `import 'server-only'` |

`requireChildOwner(supabase, childId)` selects the child with the **user** client; absent → `404 NOT_FOUND`. All service-role repositories take `userId` and `childId` and are only called after this check (or from a job whose `jobs.user_id` was set from a verified session).

## 7. Shared types and zod primitives (`src/lib/schemas/common.ts`)

```ts
export const uuid = z.string().uuid();
export const grade = z.union([z.literal(1), z.literal(2)]);
export const readingBand = z.enum(['R1','R2','R3','R4']);
export const mathLevel = z.number().int().min(1).max(4);
export const skillId = z.string().regex(/^G[12]\.[A-Z]{2,4}\.\d{2}$/);
export const itemStatus = z.enum(['correct','partial','incorrect','blank']);
export const errorType = z.enum(['calculation_slip','concept_gap','reading_difficulty','attention_copying','unclear']);
export const masteryStatus = z.enum(['secure','developing','not_yet','not_enough_evidence']);
export const paperSize = z.enum(['letter','a4']);
export const nickname = z.string().trim().min(1).max(30).regex(/^[\p{L}\p{N} '\-.]+$/u);
export const apiError = z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) });
```

### Child Profile payload (sent with every agent call — FR-14)

```ts
export const childProfileSchema = z.object({
  child: z.object({ nickname, grade }),
  baseline: z.object({ overallScore: z.number().nullable(), placement: z.string().nullable(), window: z.enum(['BOY','MOY','EOY']).nullable(), reportDate: z.string().nullable() }),
  reading: z.object({ lexile: z.number().nullable(), band: readingBand, estimated: z.boolean(), confidence: z.enum(['low','med','high']) }),
  skills: z.array(z.object({ skillId, mathLevel, status: masteryStatus, evidenceCount: z.number(), lastSeenCycle: z.number().nullable(), trend: z.enum(['improving','steady','slipping']).nullable() })),
  cycles: z.array(z.object({ cycle: z.number(), sheetId: z.string(), resultsSummary: z.string(), calibrationChanges: z.array(z.string()) })).max(4), // last 4 only; older summarised into skills
  flags: z.array(z.string()),
});
```
`buildChildProfile(childId)` (spec 02) is the only producer.

## 8. Naming and file layout

Follow EDD §11 and §12 exactly. Each spec lists its files relative to the repo root of the Next.js app. Services are `src/lib/<domain>/<name>.service.ts`; repositories `…/<name>.repo.ts` (service-role access); route handlers `src/app/api/**/route.ts` stay under ~40 lines by delegating to services.

## 9. Refinements to the EDD (authoritative here)

| # | EDD said | Spec decision | Reason |
|---|---|---|---|
| R1 | Route handlers use the user client; only jobs/deletion use service role | Parents **read** with the user client. **Derived tables are written by service-role repositories after an ownership check.** Parents write directly only: `children`, `reports`, `feedback`, `graded_items` (confirm), `uploads` (delete). | Prevents a tampered client from forging mastery, worksheets or jobs. |
| R2 | `reports.window` | Column is `assessment_window` | `window` is reserved in Postgres. |
| R3 | Jobs: five types | Adds `rerender_pdf` | Paper-size switch re-renders PDFs without new content. |
| R4 | `question_history` unique on hash | Not unique; indexed `(child_id, question_hash)` | Hashes may legally repeat after 4 cycles. |
| R5 | `worksheets.superseded_by` marks the old sheet | Adds `is_current` with a partial unique index | Allows insert-new/retire-old without constraint violation. |
| R6 | Reading state only described | Adds `children.reading_up_streak`, `reading_down_streak`, `reading_evidence_cycles` | Needed for the two-cycle rules in spec 10. |
| R7 | Rate-limit store open (Appendix B #6) | **Postgres counters** (`rate_limits` + `rate_limit_hit()` RPC) | No extra infrastructure for beta. |
| R8 | `skill_mastery.trend` always set | Nullable until two scored cycles; adds `score_history`, `retest` | PRD: a single sheet is noise. |
| R9 | `uploads` quota | Adds `confirmed_uploaded` | Distinguishes a signed slot from an uploaded object. |
| R10 | `worksheet_items` | Adds `accepted_answers`, `is_reading_probe` | Grading equivalence; reading-axis evidence (spec 10). |

## 10. Definition of done (every feature)

1. Migrations/SQL applied locally; RLS test proves cross-user isolation for any new table.
2. zod schemas shared between client and server; no `any`.
3. Every documented error code reachable and covered by an integration test.
4. UX states implemented: loading, empty, error, success; mobile layout verified at 375 px.
5. Unit, integration and E2E tests per spec's "Acceptance criteria" pass in CI.
6. No secrets in client bundle (`npm run check:secrets` greps `.next/static` for server env names).
7. Copy uses "still building / next step"; no "weak", "behind", score predictions or claims of affiliation with i-Ready's owner.

## 11. API route inventory (all specs)

| Route | Spec |
|---|---|
| `GET/PATCH /api/me`, `GET /api/me/entitlements`, `POST /api/waitlist`, `POST /api/auth/precheck` | 01, 12 |
| `GET/POST /api/children`, `GET/PATCH/DELETE /api/children/:childId`, `POST /api/children/:childId/purge-images` | 02, 13 |
| `PATCH /api/children/:childId/skills/:skillId` | 10 |
| `POST /api/uploads/sign`, `POST /api/uploads/:id/complete`, `GET /api/uploads/:id/url`, `DELETE /api/uploads/:id` | 03 |
| `GET /api/jobs/:id`, `POST /api/jobs/:id/retry` | 04 |
| `POST /api/children/:childId/reports`, `GET /api/reports/:id`, `POST /api/reports/:id/confirm` | 06 |
| `POST /api/children/:childId/diagnoses`, `GET /api/children/:childId/diagnoses/latest`, `GET /api/diagnoses/:id` | 07 |
| `POST /api/children/:childId/worksheets`, `POST /api/worksheets/:id/regenerate`, `GET /api/worksheets/:id`, `POST /api/worksheets/:id/repaper`, `POST /api/worksheets/:id/items/:itemId/flag-key`, `POST /api/cycles/:id/difficulty`, `PATCH /api/cycles/:id` | 08 |
| `POST /api/worksheets/:id/submissions`, `GET /api/cycles/:id/review-queue`, `POST /api/graded-items/:id/confirm`, `POST /api/cycles/:id/finalize` | 09 |
| `GET /api/cycles/:id/results`, `GET /api/children/:childId/cycles`, `GET /api/children/:childId/progress`, `POST /api/feedback` | 11 |
| `POST /api/billing/checkout`, `POST /api/billing/portal`, `POST /api/stripe/webhook` (Phase 2) | 12 |
| `POST /api/events`, `GET /api/health`, `GET /api/health/ai` | 14 |

## 12. Requirement traceability (PRD → spec)

| PRD item | Spec(s) |
|---|---|
| US-001 | 02, 06 |
| US-002 | 08 |
| US-003 | 03, 09 |
| US-004 | 09 |
| US-005 | 10, 11 |
| US-006 | 11 |
| US-007 (tutor, P2) | Out of MVP scope (EDD Phase 3). Schema `child_limit` and plan table already support it; no UI or batch generation specified |
| US-008 | 06 |
| US-009 | 07 |
| US-010 | 02, 12 |
| US-011 | 08, 10 |
| US-012 | 12 |
| US-013 (reminders, P2) | Out of MVP scope (EDD Phase 2); `EMAIL_*` env vars reserved in `.env.example` |
| FR-01–FR-04 | 02, 03, 06, 07 |
| FR-05–FR-09 | 08 |
| FR-10, FR-11 | 09 |
| FR-12, FR-13 | 10 |
| FR-14, FR-15 | 02, 05 |
| FR-16 | 08, 09, 10 |
| FR-17 | 02, 13 |
| FR-18 | 02, 06 |
| FR-19 | 11 |
| FR-20 | 12, 14 |
