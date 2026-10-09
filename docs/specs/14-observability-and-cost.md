# 14 — Observability, Usage Tracking and Cost Alerts

**Covers:** FR-20, PRD s3 (cost per cycle), s5 (uptime), s10 (monitoring), s11 (health monitoring, communication); EDD §6.2, §8.7, Appendix A. **Depends on:** 04, 05.

## 1. Logging (`src/lib/logger/`)
- `pino` JSON to stdout (Netlify captures). Base fields: `requestId`, `jobId?`, `userIdHash` (SHA-256 of user id, first 12 chars — never the raw id or email), `route`, `env: APP_ENV`, `level`, `durationMs`.
- `getLogger({ requestId, jobId })` returns child loggers; route wrapper logs one line per request: method, route pattern, status, duration. Job runner logs step transitions and AI call summaries (mode, model, tokens, cost, duration, attempts).
- Redaction per spec 13 §3. Levels from `LOG_LEVEL`.

## 2. Usage events (`src/lib/usage/`)
`usage.record({ userId, childId?, jobId?, event, inputTokens, outputTokens, estCostUsd })` inserts into `usage_events` (service role). Event names:

| Event | Emitted by |
|---|---|
| `foundry.parse`, `foundry.diagnose`, `foundry.generate`, `foundry.grade`, `foundry.explain` | Foundry client (per attempt, including retries) |
| `cycle.started`, `cycle.ready`, `cycle.graded`, `cycle.complete` | Cycle transitions |
| `report.parsed`, `report.confirmed` | Report flow |
| `paywall.hit`, `waitlist.optin` | Entitlements |
| `override.item` (value: overridden true/false in `event` suffix `:yes|:no`) | Parent confirmation |
| `key.flagged` | Flag-key endpoint |
| `child.deleted` | Delete job |
| `job.failed:{errorCode}` | Job runner |
Client funnel events (`score_entered`, `worksheet_printed` (download click), `photo_uploaded`, `next_sheet_started`) are sent to `POST /api/events` `{ event: enum, childId? }` (allow-listed names only; strict zod; rate limited 60/min) and recorded as `usage_events` rows with zero cost. This supports **full-loop completion** and **time to first worksheet** (computed from `cycle.started` → `cycle.ready`).

## 3. Metrics as SQL views (read by dashboards and alerts) — defined in `supabase-schema.sql` section 8
| View | Definition (summary) |
|---|---|
| `v_cost_per_cycle_7d` | `sum(est_cost_usd)` for the last 7 days ÷ `count(distinct cycle.complete)` |
| `v_override_rate_7d` | `count(override.item:yes) / count(graded items confirmed)` over 7 days |
| `v_latency_p95_by_job_7d` | `percentile_cont(0.95)` of `finished_at - started_at` per `jobs.type` |
| `v_job_failure_rate_1h` | failed / total jobs in the last hour per type |
| `v_loop_completion_30d` | cycles reaching `complete` ÷ cycles started |
| `v_key_flags_7d` | count of `key.flagged` |
| `v_monthly_spend` | month-to-date `sum(est_cost_usd)` |
Views are created with `security_invoker = true` and `select` is revoked from `anon`/`authenticated`; only the service role and the Supabase dashboard read them.

## 4. Dashboards
Supabase SQL snippets + a simple internal read-only page is **out of scope for MVP**; the team uses the Supabase dashboard (views), Netlify function logs and the Azure/Foundry usage dashboards (PRD s11). A Looker-style export is Phase 2.

## 5. Alerts (`netlify/functions/cost-alert.ts`, hourly)
Posts to `ALERT_WEBHOOK_URL` (and email `ALERT_EMAIL_TO` fallback) when:

| Condition | Threshold |
|---|---|
| Cost per cycle (rolling 7 days) | `> COST_PER_CYCLE_ALERT_USD` (default 0.35) |
| Month-to-date spend | `>= 0.8 × MONTHLY_BUDGET_USD` (once per day) |
| Parent override rate (7 days) | `> OVERRIDE_RATE_ALERT` (default 0.10) → also "trigger prompt review" per PRD s8 |
| Job failure rate (1 h) | `> 20%` with ≥ 10 jobs |
| Latency P95 | generate > 90 s, grade > 60 s, parse+diagnose > 30 s over the last 24 h |
| Wrong-key flags | ≥ 1 in 24 h → P1 (a wrong key reaching a parent is a defect) |
| Stuck jobs reaped | ≥ 5 in 1 h |
| Foundry 429 rate | > 10% of calls in 1 h (quota sizing for seasonal spikes) |
Alert payload: title, metric, value, threshold, link to the relevant view; de-duplicated with a `rate_limits` key per alert per hour.

## 6. Health and uptime
- `GET /api/health` (no auth): `{ status: 'ok', db: boolean, storage: boolean, catalogue: boolean, kbVersion }` — checks a trivial DB query, a bucket list head, and that `skills_catalog` has rows and isn't the dev fixture in production. Does **not** call Foundry (cost) — a separate `GET /api/health/ai` (requires `CRON_SECRET`) makes a 1-token `explain` call for the on-call smoke check.
- External uptime monitor (e.g. UptimeRobot) polls `/api/health` every 5 min to hit the 99.5% target; alerts to Slack.

## 7. Seasonal readiness
Before each BOY/MOY/EOY window: run the load test (spec 15 §7), confirm Foundry quota/TPM headroom ≥ 2× expected peak, raise `JOB_MAX_CONCURRENT_PER_USER` only if needed, and pre-warm by running the nightly smoke tests. Queue-depth metric: count of `queued` jobs older than 30 s > 20 → alert.

## 8. Edge cases
| Case | Behaviour |
|---|---|
| Usage insert fails | Logged and swallowed — telemetry must never fail a user flow (except cost guards, which read counters before work) |
| Pricing env missing | Cost estimates fall back to 0 and a startup warning is logged; alerts for missing config in `health` |
| Alert flapping | One alert per condition per hour |
| Deleted child's usage rows | Retained without child id (`child_id` column has no FK; the id is nulled by the delete job) |

## 9. Acceptance criteria
1. Every model call produces a `usage_events` row with tokens and cost; cost per full cycle can be queried (target ≤ $0.25 avg; alert at $0.35).
2. Logs for an E2E run contain `requestId` on every line and no nicknames/answers/emails/signed URLs.
3. `/api/health` reports `ok` in a healthy environment and `catalogue:false` when the catalogue is empty.
4. Forcing the override rate above 10% in a test database triggers the alert payload exactly once per hour.
5. Time from `cycle.started` to `cycle.ready` is queryable per cycle and P95 is reported by the view.
6. Only allow-listed client events are accepted by `/api/events`.

## 10. Tests
Unit: cost calculator, logger redaction, alert dedupe, event allow-list. Integration: views against seeded usage rows; alert function with stubbed webhook; health endpoint states.
