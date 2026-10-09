# 02 — Child Profiles

**Covers:** US-001 (child part), US-010, FR-01, FR-14, FR-17, FR-18; EDD §4.2, §4.13, §7 (`children`). **Depends on:** 01. **Provides:** `buildChildProfile()` used by specs 05–10.

## 1. User flows

1. `/children` lists children as cards (nickname, grade, "Cycle N" or "New"). "Add a child" opens a dialog (or inline form when the list is empty).
2. Form: **Nickname** (helper: "First name or nickname only"), **Grade** (radio: 1st / 2nd). Submit → `POST /api/children` → navigate to `/children/[id]/setup`.
3. Child settings tab: rename nickname, set/clear Lexile (spec 06 handles first entry), switch paper size (profile-level default), **Delete profile**.
4. Delete: dialog requires typing the nickname exactly; explains "This permanently deletes the profile, worksheets, photos and progress"; confirm → `DELETE /api/children/:id` → progress screen polling the `delete_child` job → redirect `/children` with toast.

## 2. Database

Table `children` (see SQL). Behaviour enforced in the database:
- unique `(user_id, nickname)` (case-sensitive; the API lower-cases for comparison, see §4);
- trigger `children_enforce_limit` raises `CHILD_LIMIT` when the plan's `child_limit` is reached (free plan: 3 in MVP, per EDD);
- trigger `children_lock_grade` raises `GRADE_LOCKED` once `current_cycle > 0`.

Initial reading state when a child is created: `reading_band = null`, `reading_band_estimated = true`, `reading_confidence = 'low'`. The band is set when a report is confirmed (spec 06 §6) via `deriveReadingBand()` (§4.3).

## 3. API

| Method / path | Request (strict) | Response | Errors |
|---|---|---|---|
| `GET /api/children` | — | `200 { children: ChildDto[] }` | 401 |
| `POST /api/children` | `{ nickname, grade }` | `201 ChildDto` | 400, `CHILD_EXISTS` 409, `CHILD_LIMIT` 422 |
| `GET /api/children/:childId` | — | `200 ChildDto` | 404 |
| `PATCH /api/children/:childId` | any of `{ nickname, grade, lexile: int 0–1500 \| null }` | `200 ChildDto` | 400, 404, `CHILD_EXISTS`, `GRADE_LOCKED` |
| `DELETE /api/children/:childId` | `{ confirm: string }` | `202 { jobId }` | 400 (`confirm` ≠ nickname), 404 |

```ts
ChildDto = { id, nickname, grade, lexile: number|null, readingBand: 'R1'|…|null,
             readingBandEstimated: boolean, readingConfidence: 'low'|'med'|'high',
             currentCycle: number, createdAt }
```
Creating or changing `lexile` via PATCH also recomputes `reading_band` (`estimated=false`) and writes a `calibration_events` row (`axis='reading'`, `source='baseline_reset'`, reason "Lexile {n} entered → band {Rx}") when a band already existed and changes. Setting `lexile = null` keeps the current band but sets `reading_band_estimated = true`.

## 4. Backend implementation

### 4.1 Files
`src/lib/children/children.service.ts`, `children.repo.ts`, `build-child-profile.ts`, `derive-reading-band.ts`, `delete-child.job.ts`; routes under `src/app/api/children/`.

### 4.2 Nickname rules
Trim, collapse inner whitespace, 1–30 characters, letters/digits/space/`'`/`-`/`.`. Soft surname warning: if the value has ≥ 2 words and each starts with a capital letter, the API still succeeds but returns `warnings: ['NICKNAME_LOOKS_LIKE_FULL_NAME']`; the UI shows a non-blocking notice ("We only need a first name or nickname"). Uniqueness comparison is case-insensitive (`lower()` check in the service before insert; the DB unique index is the final guard → `CHILD_EXISTS`).

### 4.3 `deriveReadingBand(grade, lexile | null)`
- With Lexile → band from the **knowledge-base Lexile → R-band table** (`kb/iready_interpretation.md` section "Lexile bands", loaded at build into `src/lib/reading/lexile-bands.generated.ts` by `npm run kb:build`). Returns `{ band, estimated: false }`.
- Without Lexile (FR-18) → conservative grade estimate: grade 1 → `R2`... **conservative** means one band below the grade default: Grade 1 default `R2` → estimate `R1`; Grade 2 default `R3` → estimate `R2`. Returns `{ band, estimated: true }`. These two defaults are constants in `reading/config.ts`, and are overridden by the KB table when it defines a fallback.

### 4.4 `buildChildProfile(childId)` → `ChildProfile` (schema in spec 00 §7)
- Reads `children`, latest confirmed `reports` row, `skill_mastery` rows, last 4 `cycles` (summary + calibration texts), open flags.
- `flags` examples: `reading_estimated`, `read_aloud_last_cycle`, `skill_retest:{skillId}`, `suggest_teacher_share` (set by spec 10 when ≥ 6 cycles show no improvement).
- Output is deterministic and ≤ 6 KB; if larger, drop `cycles` summaries beyond the last 2 first.
- Cached in `children.profile_summary`; rebuilt after every finalised cycle and after report confirmation.

### 4.5 Delete child job (`delete_child`)
1. Ownership asserted from `jobs.user_id` + `child_id`.
2. List and remove Storage objects under `uploads/{userId}/{childId}/` and `worksheets/{userId}/{childId}/` (paginate 100 at a time).
3. Delete `children` row (service role); all child-scoped tables cascade.
4. Insert `usage_events` row `event='child_deleted'` (no child id).
5. Mark the job succeeded. The job is created with `child_id = null` and `input.childId` (so it survives the cascade delete of the child); the daily cleanup removes it after 7 days.
Idempotent: re-running after partial failure skips already-removed objects.

## 5. Frontend implementation

| Component | File | Notes |
|---|---|---|
| `ChildList` | `components/children/ChildList.tsx` | Query `['children']`; empty state with CTA |
| `ChildCard` | `components/children/ChildCard.tsx` | Link to `/children/[id]/setup` (or `/plan` once a diagnosis exists) |
| `ChildForm` | `components/children/ChildForm.tsx` | zod `{ nickname, grade }`; used in dialog |
| `DeleteChildDialog` | `components/children/DeleteChildDialog.tsx` | Typed confirmation; then `<JobProgress />` |
| `ChildSwitcher` | `components/layout/ChildSwitcher.tsx` | Header dropdown; remembers last child in `localStorage` (non-sensitive id only) |

Mutations invalidate `['children']`. Optimistic updates are not used for create/delete.

## 6. Edge cases

| Case | Behaviour |
|---|---|
| 4th child on free plan | `CHILD_LIMIT` → dialog message "Your plan allows up to 3 children" and link to `/pricing` |
| Duplicate nickname differing by case/space | `CHILD_EXISTS` |
| Change grade after first worksheet | `GRADE_LOCKED`; UI disables the grade control with explanation; suggests creating a new profile |
| Delete while a job is running for the child | Delete waits: the delete job first sets `jobs.status='failed', error_code='CHILD_DELETED'` for running jobs of that child, then proceeds |
| Delete job fails midway | Retry (bounded, idempotent); UI shows "Still deleting…" with retry |
| Double submit on create | Button disabled; server unique constraint is the backstop |
| Nickname with emoji/HTML | Rejected by regex (400) |
| Lexile out of range | 400 |
| Plan changes reduce limit below current count | Existing children stay; creation blocked |

## 7. Acceptance criteria

1. A user can create up to 3 children; the 4th returns `CHILD_LIMIT` (422).
2. Nicknames are unique per user case-insensitively.
3. Changing grade after `current_cycle > 0` returns `GRADE_LOCKED`.
4. Entering a Lexile sets `reading_band` with `estimated=false`; omitting it yields a conservative band with `estimated=true`, displayed as "estimated".
5. `buildChildProfile` output validates against `childProfileSchema` and is ≤ 6 KB for a child with 12 cycles and 20 skills.
6. Deleting a child removes all rows in every child-scoped table and all objects under both bucket prefixes (integration test lists Storage afterwards = empty) and leaves non-identifying `usage_events`.
7. User B receives 404 for user A's child on every endpoint.
8. No field in the UI or API accepts surname, school, birthdate or location.

## 8. Tests
Unit: nickname normaliser, `deriveReadingBand`, `buildChildProfile` size cap. Integration: limit/lock triggers via API, deletion completeness, RLS isolation. E2E: create → duplicate error → delete flow.
