# 04 — Jobs Framework (async pipeline on Netlify)

**Covers:** EDD §6.4, §8.7 (concurrency), §8.8; PRD s5 latency targets, s11 recovery plan. **Depends on:** schema. **Used by:** 02, 06–10.

## 1. Why
Netlify synchronous functions time out well before the PRD's 90 s generation target. Every AI or heavy task therefore runs as a **job**: a database row plus a Netlify Background Function (up to 15 minutes). The browser polls job state. Verify the current platform limits in the day-one spike (EDD Appendix B #1); this design assumes the worst case.

## 2. Job types and inputs

| `type` | Created by | `input` | `result` |
|---|---|---|---|
| `parse_report` | `POST /api/children/:id/reports` (uploads) | `{ reportId }` | `{ reportId }` |
| `diagnose` | `POST /api/reports/:id/confirm`, `POST /api/children/:id/diagnoses` | `{ reportId }` | `{ diagnosisId }` |
| `generate_worksheet` | `POST /api/children/:id/worksheets`, `/regenerate` | `{ cycleId, diagnosisId, focusSkillIds?, paperSize, regenerate?: boolean }` | `{ worksheetId }` |
| `rerender_pdf` | `POST /api/worksheets/:id/repaper` | `{ worksheetId, paperSize }` | `{ worksheetId }` |
| `grade_sheet` | `POST /api/worksheets/:id/submissions` | `{ worksheetId, cycleId, uploadIds, readAloud }` | `{ cycleId, flaggedCount }` or error `PHOTO_QUALITY` |
| `recalibrate` | `POST /api/cycles/:id/finalize` | `{ cycleId, skipUnconfirmed }` | `{ cycleId }` |
| `delete_child` | `DELETE /api/children/:id` | `{ childId }` (job `child_id` null) | `{}` |

Progress steps per type are constants in `src/lib/jobs/steps.ts`; e.g. `generate_worksheet`: `reading_profile` 10 → `choosing_skills` 25 → `writing_problems` 55 → `verifying_answers` 75 → `building_pdf` 90 → `done` 100. The UI maps step ids to the PRD labels ("reading profile → choosing skills → writing problems → verifying answers → building PDF").

## 3. Lifecycle

```
queued ──claim_job()──▶ running ──▶ succeeded
   ▲                       │
   └──── retry (≤3) ◀──── failed
```

1. **Enqueue** (`enqueueJob({ userId, childId, type, input })`, service role):
   - concurrency guard: count of the user's `queued|running` jobs `< JOB_MAX_CONCURRENT_PER_USER` (default 2) else `429 RATE_LIMITED` ("Please wait for your current task to finish");
   - insert row, then `fetch(`${NEXT_PUBLIC_SITE_URL}/.netlify/functions/run-job-background`, { method:'POST', headers:{ 'x-signature': hmac(jobId) }, body: JSON.stringify({ jobId }) })`; expects `202`; on network failure the job stays `queued` and the reaper re-triggers it (§6);
   - returns `jobId`.
2. **Run** (`netlify/functions/run-job-background.ts`): verify HMAC (`sha256` over `jobId` with `JOB_SIGNING_SECRET`, constant-time compare; mismatch → 401, log); call RPC `claim_job(jobId)` (atomic; `null` → already running/finished → exit); dispatch `runners[job.type](job)`; the runner updates progress via `setProgress(jobId, step, percent)` (throttled to 1 write/second); on success write `result`, `status='succeeded'`, `finished_at`; on error map to `error_code`/`error_message` and set `failed`.
3. **Poll**: `GET /api/jobs/:id` returns `{ id, type, status, progress, result, error: { code, message, retryable } | null, attempts }` (RLS ensures owner). `retryable = attempts < 3 && errorCodeIsRetryable(code)`.
4. **Retry**: `POST /api/jobs/:id/retry` → only when `failed`, owner, `attempts < 3` (else `JOB_RETRY_LIMIT`); sets `status='queued'`, clears error, re-triggers the background function. Runners are **idempotent** (§5) so a retry is safe.

### Retryable error codes
`AI_UNAVAILABLE`, `AI_INVALID_OUTPUT`, `INTERNAL`, `TIMEOUT` → retryable. `PHOTO_QUALITY`, `SHEET_MISMATCH`, `CHILD_DELETED`, `PAYWALL`, `REPORT_NOT_CONFIRMED` → not retryable (user action needed).

## 4. Polling client (`src/hooks/use-job.ts`)

```ts
useJob(jobId: string | null, { onSuccess, onError }): { job, isPolling }
```
- TanStack Query with `refetchInterval` following `JOB_POLL_INTERVAL_MS` (2 s, 2 s, 3 s, then 5 s) while `status ∈ {queued, running}` **and** `document.visibilityState === 'visible'`; stops on terminal state; resumes on tab focus.
- On 401 → redirect to login. On network error: keep polling with backoff up to 5 failures, then show "Connection lost — we'll keep trying" banner.
- Persist the active `jobId` per screen in `sessionStorage` (`tr:job:{screen}:{childId}`) so a refresh re-attaches to the job.
- `<JobProgress job={job} labels={…} />` renders a stepper with `aria-live="polite"`, percent, an "Taking longer than usual" hint after 120 s, and **Try again** / **Cancel** (cancel = ignore on client; server job continues, result is stored).

## 5. Idempotency and concurrency rules
- Runners check the existing artifacts first: e.g. `generate_worksheet` for a `cycleId` whose current worksheet has `verified_at` set returns that worksheet; `grade_sheet` skips graded items already stored; `parse_report` returns if `parse_status='parsed'`.
- A second enqueue of the same `(type, childId, input.cycleId|reportId)` while one is `queued|running` returns the existing job id (dedupe key in service code).
- Database writes in a runner that must be atomic are done in a single RPC or sequenced so that the "complete" marker (`verified_at`, `parse_status='parsed'`, `cycles.status`) is written last.

## 6. Scheduled functions

| Function | Schedule | Behaviour |
|---|---|---|
| `reap-stale-jobs` | every 5 min | `running` and `started_at < now() - JOB_MAX_RUNTIME_MINUTES` → `failed` with code `TIMEOUT`; `queued` older than 2 min and `attempts < 3` → re-trigger run function; failed jobs older than 7 days with `child_id is null` deleted |
| `purge-expired-uploads` | daily 03:00 UTC | spec 13 §4 |
| `cost-alert` | hourly | spec 14 §5 |

Scheduled functions declared in `netlify.toml` (`[functions."reap-stale-jobs"] schedule = "*/5 * * * *"`). Each also accepts an HTTP call with `Authorization: Bearer ${CRON_SECRET}` for manual runs.

## 7. Backend structure
```
src/lib/jobs/
  enqueue.ts      runners/index.ts      runners/{parse-report,diagnose,generate-worksheet,rerender-pdf,grade-sheet,recalibrate,delete-child}.ts
  progress.ts     steps.ts              errors.ts (code → retryable, user message)    sign.ts (hmac)
netlify/functions/run-job-background.ts  reap-stale-jobs.ts
```
Runners receive a `JobContext { job, supabase (service), log, foundry, usage }`; they must call `ctx.usage.record()` for every model call (spec 14).

## 8. Edge cases

| Case | Behaviour |
|---|---|
| Background trigger fails (network) | Job remains `queued`; reaper re-triggers within 5 min; UI shows progress "queued" |
| Function killed mid-run | `running` state stale → reaper fails it → user retries; idempotent runner resumes |
| Two background invocations race | `claim_job` returns null for the loser |
| User deleted child while job runs | Runner re-checks child existence at each step boundary; throws `CHILD_DELETED` |
| Duplicate click on "Generate" | Dedupe returns the same `jobId` |
| 3 failed attempts | Job terminal; UI offers "Contact support" with job id; last good worksheet remains downloadable |
| Clock skew on reaper | Uses DB `now()` only |
| Huge `input` payloads | `input` holds ids only; images/pdfs referenced by upload ids |

## 9. Acceptance criteria
1. Creating a job returns `202` in < 1 s regardless of AI latency.
2. The browser shows live step labels and percentages; a refresh re-attaches to the running job.
3. A forged call to the run function without a valid HMAC returns 401 and runs nothing.
4. A job stuck `running` > 10 min is failed by the reaper; the user can retry; the retry produces exactly one set of artifacts (no duplicates).
5. After 3 failed attempts, retry returns `JOB_RETRY_LIMIT`.
6. A user with 2 active jobs receives 429 on a third.
7. Polling pauses in a hidden tab and resumes on focus.

## 10. Tests
Unit: HMAC, retry classification, poll interval schedule. Integration: enqueue → run (mock runner) → poll; claim race; reaper; idempotent runner replays. E2E: generate flow shows progress and recovers from a forced failure via Try again.
