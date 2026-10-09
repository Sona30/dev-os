# 13 — Privacy, Data Minimisation, Retention and Deletion

**Covers:** FR-17, PRD s5 (compliance, retention), s11 Responsible AI, A15–A16; EDD §4.13, §7.3, §8.9, §10 (1.14–1.15). **Depends on:** 02, 03, schema. Legal review of terms and child-data policy is a **launch gate** (PRD s11); this spec defines the engineering controls.

## 1. Data inventory

| Data | Where | Why | Retention |
|---|---|---|---|
| Parent email, hashed password | Supabase Auth, `profiles` | Account | Until account deleted |
| Child nickname, grade, Lexile, reading band | `children` | Personalisation | Until the parent deletes the profile |
| Scores, placement, domain results | `reports`, `diagnoses` | Gap analysis | Until profile deleted |
| Worksheets, items, answers, history | `worksheets*`, `question_history`, PDFs | Practice + freshness | Until profile deleted |
| Report page images, sheet photos, item crops | `uploads` bucket | Parsing, grading, review | **30 days** from upload (or parent delete) |
| Graded results, mastery, calibration events | DB | Recalibration, progress | Until profile deleted |
| Usage/cost events | `usage_events` | Cost control | Kept; contains no child identifiers after deletion |
| Job records | `jobs` | Status | Terminal jobs older than 90 days deleted; `delete_child` jobs after 7 days |
| Logs | Netlify/pino | Operations | 30 days; never contain images, nicknames or answers (§3) |

**Not collected, by design:** surname, school, birthdate, location, photos of the child, device identifiers beyond what Supabase/Netlify need. No schema column exists for them. Images have EXIF stripped client-side (spec 03).

## 2. Controls

### 2.1 Minimisation in the UI
Helper text on nickname and upload screens; soft warning for full-name-like nicknames (spec 02); tip to cover/crop the name field on reports and sheets (spec 03). The `CoverNameTip` component is mandatory on both upload surfaces (acceptance test).

### 2.2 No training / provider data handling
Foundry calls send only nickname, grade, scores, images and the Child Profile (no email, no user id). Azure data-handling terms confirmed as "not used for model training" and recorded in `docs/security/` in Stage 7. Threads deleted after each run (spec 05).

### 2.3 Access isolation
RLS on every table; Storage policies by `{userId}` prefix; signed URLs with 15-minute TTL for any image/PDF read; service-role code only in `src/lib/**/*.repo.ts` guarded by `import 'server-only'`. Integration tests prove user B cannot read user A rows or objects.

### 2.4 Encryption
At rest and in transit via Supabase/Netlify/Azure defaults (HTTPS only; HSTS header from `next.config.js`). No additional field-level encryption in MVP.

## 3. Logging rules
`logger` (pino) redacts keys `nickname`, `answer`, `extractedAnswer`, `email`, `authorization`, `cookie`, `password`, `token`, `url` (signed URLs) via `redact` paths. Never log request bodies or image bytes/URLs. Unit test asserts redaction on a sample object.

## 4. Retention jobs

### `purge-expired-uploads` (daily 03:00 UTC)
1. Select `uploads` where `expires_at < now()` and `deleted_at is null` (batch 200): delete Storage object, set `deleted_at = now()`; delete the row after 7 days (audit window) — for `item_crop` rows delete immediately.
2. Delete incomplete slots (`confirmed_uploaded=false` and `created_at < now() - interval '1 hour'`).
3. After deleting a sheet photo, null out `graded_items.crop_path` for crops that were deleted.
4. Delete `rate_limits` rows with `window_start < now() - interval '2 days'`.
5. Delete terminal `jobs` older than 90 days; `delete_child` jobs older than 7 days.
6. Orphan sweep (weekly, same function with `?sweep=orphans` via cron secret): list Storage prefixes whose `{userId}` no longer exists in `profiles` or `{childId}` no longer exists in `children` and delete them (covers manual user deletion in the Supabase dashboard).
7. Log counts only.

### Parent-triggered deletion (FR-17, instant)
- Delete a single upload: `DELETE /api/uploads/:id`.
- Delete a child: spec 02 §4.5 (all DB rows + Storage prefixes in both buckets + usage anonymisation by absence of FK).
- "Delete all my photos" button in Account/Child settings: sets `expires_at = now()` for the child's uploads and calls the purge routine for that child immediately (`POST /api/children/:id/purge-images` → `204`).
- Account deletion (Phase 2 UI; MVP via support email) = delete each child then `auth.admin.deleteUser`.

## 5. Consent, disclosures and policy pages
- Sign-up consent checkbox stores `terms_accepted_at` (spec 01).
- Static pages `/privacy`, `/terms`, `/trust`: content authored with legal review; engineering requirement is that they exist, are linked in the footer and sign-up, and carry a "last updated" date from a constant.
- Persistent disclosures: results pages (spec 11), AI disclosure, "estimated" reading labels, answer-key skill/level tags.
- Trademark use: "i-Ready" appears only descriptively; footer states "TestReady is not affiliated with or endorsed by Curriculum Associates" (PRD A16). Copy review required before launch.
- Region: US launch only; EU/UK users are not marketed to and a locale check shows a "currently available in the US" notice when `navigator.language` region is in the EU/UK (soft gate, not blocking).

## 6. Incident handling (engineering part of PRD s11)
Runbook `docs/security/incident-response.md` (Stage 7) must cover: detection (alerts in spec 14), containment (rotate keys, disable signed URL issuance with env `DISABLE_SIGNED_URLS=true`), notification (in-app banner via env `SITE_NOTICE_TEXT` (read by the root layout) and email within 1 hour for P0, banner within 2 hours for P1).

## 7. Edge cases
| Case | Behaviour |
|---|---|
| Image contains a name | Cannot be detected reliably; mitigated by tip and 30-day deletion; document in the trust page |
| Parent deletes photos before grading finishes | Job fails `CONFLICT`; user re-uploads |
| Deleted child while Storage list is paginated | Loop until empty, tolerate 404s |
| Purge fails midway | Next run continues (idempotent by `deleted_at`) |
| Clock changes of `expires_at` | DB default is `now() + 30 days`; env `UPLOAD_RETENTION_DAYS` adjusts the default used by the service when inserting |
| Backups | Supabase backups may retain deleted data per provider policy; stated in the privacy policy |

## 8. Acceptance criteria
1. No table or form accepts surname, school, birthdate or location; schema review confirms.
2. Uploaded images older than 30 days are removed from Storage by the nightly job (test with time-shifted fixture).
3. Deleting a child leaves zero rows referencing it and zero objects under its prefixes in both buckets.
4. Logs never contain nicknames, answers, emails or signed URLs (redaction test + log grep in CI on E2E run).
5. A signed image URL stops working after its TTL.
6. A user cannot list or read another user's objects (Storage policy test).
7. Privacy/terms/trust pages exist and are linked from sign-up and footer; consent timestamp is stored.
8. "Delete all photos" removes all of a child's images immediately while keeping mastery data.

## 9. Tests
Unit: redaction, retention date maths. Integration: purge function on seeded old rows, orphan sweep, Storage RLS, delete-child completeness, purge-images endpoint. E2E: delete flows; policy links present.
