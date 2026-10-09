# 12 — Entitlements, Cost Guards, Paywall Stub and Stripe (Phase 2)

**Covers:** US-012, US-010 (limits), FR-20; PRD s12 (pricing), s3 cost metrics; EDD §4.14, §7 (`subscriptions`), §8.7, §10 (Phase 2). **Depends on:** schema, 04. **Used by:** 02, 08.

## 1. Plans (directional, from PRD s12)

| Plan | Price | Limits enforced in code |
|---|---|---|
| `free` (Free Diagnostic) | $0 | 1 gap analysis, **1 worksheet, 1 graded upload** per user (household); `child_limit` 3 (profiles allowed, but only one free cycle across all); `daily_cycle_cap` 3 |
| `season` | $29 / 12 weeks, one child | ≤ 12 worksheets in the period; 1 child with cycles |
| `family` | $9.99/mo or $79/yr | up to 3 children; ≤ 12 worksheets per child per calendar month |
| `tutor` (P2/v1.2) | $24.99/mo | up to 10 children (not in MVP) |
Constants live in `src/lib/entitlements/plans.ts` (single source), so prices/limits can change without code elsewhere.

## 2. MVP behaviour
- No payments. All users are `plan='free'`, `status='none'`.
- The **free cycle** is consumed when the first worksheet becomes `ready` (spec 08 §4.5 step 7); a failed generation does not consume it.
- **Paywall stub:** starting any cycle beyond the first returns `402 PAYWALL`. UI shows `/pricing` with the three plans, copy "Your free diagnostic is complete", a **Notify me** button (stores `subscriptions.waitlist_opt_in=true` through RPC `set_waitlist_opt_in`) and no payment fields. Existing data stays accessible (view results, progress, download earlier sheets).
- **Cost guards (FR-20):** per-call token caps (spec 05), 1 regeneration per cycle, `daily_cycle_cap` per user per UTC day, concurrency cap (spec 04), photo submissions limited to 3 per worksheet attempt. Daily cap counts cycles **created** today across all the user's children (`cycles.created_at >= date_trunc('day', now() at time zone 'utc')`).

## 3. API
| Method / path | Response |
|---|---|
| `GET /api/me/entitlements` | `{ plan, status, canStartCycle: boolean, reason?: 'PAYWALL'|'DAILY_CAP'|'CHILD_LIMIT', cyclesRemainingToday: number, freeCycleUsed: boolean, childLimit: number, limits: { worksheetsThisPeriod?: number, worksheetsAllowed?: number } }` |
| `POST /api/waitlist` `{ optIn: boolean }` | `204` (calls RPC `set_waitlist_opt_in`) |
| `POST /api/billing/checkout` *(Phase 2)* `{ plan: 'season'\|'family_monthly'\|'family_annual', childId?: uuid }` | `200 { url }` Stripe Checkout URL |
| `POST /api/billing/portal` *(Phase 2)* | `200 { url }` Stripe customer portal |
| `POST /api/stripe/webhook` *(Phase 2)* | `200` after signature verification; idempotent |

## 4. Backend implementation
`src/lib/entitlements/`:
- `canStartCycle(userId, childId)`: reads `subscriptions`; applies rules by plan:
  - `free`: if `free_cycle_used` → `PAYWALL`.
  - `season|family` with `status='active'` and `current_period_end > now()`: check period/month counters from `cycles`.
  - `past_due`/`canceled`/expired: treated as `free` (read-only past data) → `PAYWALL`.
  - then daily cap → `DAILY_CAP`.
- `assertCanStartCycle()` throws `AppError` with the matching code; called by `POST …/worksheets` **before** `allocate_cycle` and before any model call.
- `consumeFreeCycle(userId)` sets `free_cycle_used = true` when the worksheet is ready (service role, idempotent).
- Rate-limit helper `rateLimit(key, windowSec, max)` wraps RPC `rate_limit_hit`.

### Stripe (Phase 2 design, ready for implementation)
1. Checkout: server creates/reuses a Stripe customer (`stripe_customer_id`), builds a Checkout Session (`mode: 'subscription'` for Family, `'payment'` for Season Pass with `metadata: { userId, plan }`), `success_url=/pricing/success`, `cancel_url=/pricing`. No card data touches the app.
2. Webhook (`checkout.session.completed`, `customer.subscription.updated|deleted`, `invoice.payment_failed`): verify with `stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)` (use `request.text()`); idempotent via a `stripe_events(id text primary key, processed_at)` table (added in the Phase 2 migration); update `subscriptions` with the service role: `plan`, `status`, `current_period_end` (Season Pass = purchase time + 12 weeks), `child_limit` (Family 3, Season 1), `daily_cycle_cap` unchanged.
3. Entitlement read is always from `subscriptions`; the client never decides.

## 5. Frontend implementation
`PricingPage` (plans table per PRD, "Less than one tutoring session a month…" anchor line, siblings included), `PaywallDialog` (shown when generation returns `PAYWALL`), `NotifyMeButton`, `EntitlementsProvider` (React Query `['entitlements']`, refetch on focus). Generate buttons read `canStartCycle` to pre-empt the error and show cap messages ("Today's limit reached. Try again tomorrow.").

## 6. Edge cases
| Case | Behaviour |
|---|---|
| Free user starts generation in two tabs | The second `allocate`/job dedupe fails with `CONFLICT`; `consumeFreeCycle` idempotent |
| Failed free generation | Not consumed; user may retry |
| Free user deletes the child after the first sheet | `free_cycle_used` remains true (household limit) |
| Parent changes children to bypass the free limit | Counter is per user, not per child |
| Webhook replay/out-of-order | Idempotency table; `current_period_end` only moves forward |
| Past-due | Read-only mode plus banner; no new cycles |
| Daily cap at midnight UTC rollover | Computed from DB time |
| Plan downgrades below child count | Existing children retained, creation blocked, cycles allowed only for children within the new limit (first N by creation) |

## 7. Acceptance criteria
1. A free user can complete exactly one gap analysis, one worksheet and one graded upload; the second worksheet attempt returns `402 PAYWALL` before any model call.
2. A failed generation does not consume the free cycle.
3. `daily_cycle_cap` is enforced (4th cycle in a day → `DAILY_CAP` 429) and resets at 00:00 UTC.
4. Regeneration beyond 1 per cycle is rejected.
5. Paywall page offers waitlist opt-in; no payment inputs exist in MVP.
6. (Phase 2) Webhook with a bad signature returns 400 and changes nothing; replaying a valid event twice changes state once.
7. Entitlements endpoint output always matches server enforcement (contract test).

## 8. Tests
Unit: `canStartCycle` matrix by plan/status/date. Integration: paywall, caps, free-cycle consumption, waitlist RPC. Phase 2: Stripe CLI webhook fixtures.
