# 01 — Authentication, Sessions and Profiles

**Covers:** EDD §4.1, §6.2 (auth/authz); PRD s5 (adult accounts only), FR-17 (account part). **Depends on:** `supabase-schema.sql`. **Builds:** first.

## 1. User flows

| Flow | Steps |
|---|---|
| Sign up | `/signup` → email, password (≥ 10 chars), confirm password, consent checkbox ("I'm an adult and I agree to the Terms and Privacy Policy") → Supabase `signUp` with `options.data.terms_accepted_at = <ISO now>` and `emailRedirectTo = {NEXT_PUBLIC_SITE_URL}/auth/callback` → "Check your email" screen. |
| Confirm email | Link → `/auth/callback?code=…` → `exchangeCodeForSession` → redirect `/children`. |
| Log in | `/login` → `signInWithPassword` → redirect to `next` query param (same-origin paths only) or `/children`. |
| Log out | Account menu → `signOut` → `/login`. |
| Forgot password | `/login` link → `/forgot-password` → `resetPasswordForEmail` (always shows the same success text) → email link → `/auth/callback?next=/reset-password` → `/reset-password` → `updateUser({password})`. |
| Settings | `/account`: paper size (letter/A4), delete account (Phase 2; MVP shows "email us" text). |

## 2. Database

Uses `profiles`, `subscriptions`. Trigger `on_auth_user_created` creates both rows on sign-up (`profiles.terms_accepted_at` from user metadata). `paper_size` default `letter`; on first login the client sends `Intl.DateTimeFormat().resolvedOptions().locale`; if the region is not `US`, `CA`, `MX` the profile is updated to `a4` once (flag stored in `profiles.locale` being `en-US` default → only auto-set when `locale = 'en-US'` and the browser locale differs).

Supabase Auth settings (dashboard): email confirmation **on**; minimum password length 10; site URL = `NEXT_PUBLIC_SITE_URL`; redirect allow-list = `{NEXT_PUBLIC_SITE_URL}/auth/callback`; JWT expiry 3600 s; refresh token rotation on.

## 3. API

Auth uses Supabase directly (no custom auth endpoints) except:

| Method / path | Auth | Request | Response | Errors |
|---|---|---|---|---|
| `GET /api/me` | user | — | `200 { id, email, paperSize, locale }` | 401 |
| `PATCH /api/me` | user | `{ paperSize?: 'letter'\|'a4', locale?: string(≤10) }` (strict) | `200` profile | 400, 401 |
| `GET /api/me/entitlements` | user | — | see spec 12 | 401 |

Rate limits: `/api/me` PATCH 30/min.

## 4. Backend implementation

- `src/middleware.ts` (Edge): uses `@supabase/ssr` `createServerClient` to refresh the session cookie on each request. Matcher excludes `_next`, static assets, `/api/stripe/webhook`, `/.netlify`.
  - Unauthenticated + path under `(app)` or `/pricing` checkout → redirect `/login?next=<path>`.
  - Authenticated + `/login` or `/signup` → redirect `/children`.
- `src/app/auth/callback/route.ts`: reads `code` and `next`; validates `next` starts with `/` and not `//`; exchanges code; on error redirect `/login?error=link_expired`.
- `getCurrentUser()` helper (`src/lib/auth/current-user.ts`) calls `supabase.auth.getUser()`; used by Server Components and `route()`.
- `profiles.service.ts`: `getProfile(userId)`, `updateProfile(userId, patch)`.
- Cookie flags: `httpOnly`, `secure` in production, `sameSite=lax` (Supabase SSR defaults).
- Account enumeration: login errors always say "Email or password is incorrect"; sign-up for an existing email shows the same "Check your email" screen.

## 5. Frontend implementation

| Component | File | Notes |
|---|---|---|
| `AuthForm` | `components/auth/AuthForm.tsx` | Shared layout for login/signup/forgot/reset; `react-hook-form` + zod |
| `PasswordField` | `components/auth/PasswordField.tsx` | Show/hide toggle, `autocomplete` (`new-password`/`current-password`), strength hint text (length only) |
| `ConsentCheckbox` | `components/auth/ConsentCheckbox.tsx` | Required on sign-up; links open in new tab |
| `AccountMenu` | `components/layout/AccountMenu.tsx` | Email, paper size, log out |

Zod: `email` (valid, ≤ 254), `password` (10–72 chars), `confirm` equals password, `consent` literal true.
States: submit disabled + spinner while pending; inline field errors; top-level error alert (`role="alert"`); success screens for check-email and password reset.

## 6. Edge cases

| Case | Behaviour |
|---|---|
| Expired/used confirmation link | `/login?error=link_expired` banner with "Send a new link" (resend via `auth.resend`) |
| Session expires mid-job | Polling gets 401 → redirect to `/login?next=<current>`; job continues server-side; results visible after login |
| Two tabs sign out | `onAuthStateChange` in a top-level client provider redirects other tabs |
| `next` param is an external URL | Ignored; falls back to `/children` |
| Email already registered | Same generic success screen; no enumeration |
| Brute force | IP rate limit 10/min on auth form submissions (client calls a thin `/api/auth/precheck` that only increments the limiter and returns 200/429) |
| User deleted in Supabase dashboard | Cascades through `profiles` → all data; Storage objects purged by `purge-expired-uploads` orphan sweep (spec 13 §5) |

## 7. Acceptance criteria

1. A new user receives a confirmation email, confirms, and lands on `/children` with an empty-state prompt.
2. After sign-up, `profiles` and `subscriptions (plan='free', status='none')` rows exist.
3. Visiting any `(app)` route while signed out redirects to `/login?next=…`; after login returns to the original path.
4. User A cannot read or modify user B's `profiles`/`subscriptions` rows (RLS integration test).
5. `PATCH /api/me` with `paperSize: 'a4'` persists and the next worksheet defaults to A4.
6. External `next` values are ignored (test with `https://evil.test`, `//evil.test`).
7. Server-only env variables never appear in `.next/static` (check:secrets).
8. Axe reports zero serious violations on `/login` and `/signup`; fully keyboard operable.

## 8. Tests

- Unit: `next` sanitiser; zod schemas.
- Integration (local Supabase): sign-up trigger creates rows; RLS isolation; `PATCH /api/me` validation.
- E2E: sign up (confirmation bypassed through the local Inbucket/mail API), log in, log out, protected redirect.
