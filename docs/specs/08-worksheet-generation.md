# 08 — Worksheet Generation (Screen 2, bottom half)

**Covers:** US-002, US-011, FR-05–FR-09, FR-06, FR-07, FR-08, FR-16 (flag intake), FR-20; EDD §4.7, §4.8, §8.4, §9.4; PRD Flow 2. **Depends on:** 04, 05, 07, 10 (reads mastery), 12 (entitlements).

## 1. User flow
1. On `/plan`, `FocusPicker` shows recommended skills (default = top gaps by priority, ≤ 6 skills selectable, at least 1). **Generate worksheet** posts the request.
2. `JobProgress` shows: reading profile → choosing skills → writing problems → verifying answers → building PDF.
3. `WorksheetPreview` shows the student sheet as an HTML preview (no answers), buttons **Download Student Sheet (PDF)** and **Download Parent Answer Key (PDF)**, `PaperSizeToggle` (Letter/A4), **Regenerate** (once per cycle), **Too hard / Too easy**, and a print tip ("14pt, black-and-white friendly. 15–25 minutes. Please don't coach; tell us if you read aloud").
4. After printing, the parent goes to Screen 3 (spec 09).

## 2. Database
`cycles`, `worksheets`, `worksheet_items`, `question_history` (see SQL). Cycle allocation uses RPC `allocate_cycle(child, diagnosis)` (atomic increment of `children.current_cycle`). `cycles.focus` stores the **axis plan** (§4.1). Student-safe responses never select `correct_answer`, `accepted_answers`, `working`, `verification`.

## 3. API
| Method / path | Request (strict) | Response | Errors |
|---|---|---|---|
| `POST /api/children/:childId/worksheets` | `{ diagnosisId: uuid, focusSkillIds?: skillId[1..6], paperSize?: 'letter'\|'a4' }` | `202 { jobId, cycleId }` | 400, 404, `PAYWALL` 402, `DAILY_CAP` 429, `REPORT_NOT_CONFIRMED` 409, `CONFLICT` 409 if the child already has a cycle in `generating|ready|grading|needs_review` |
| `POST /api/worksheets/:worksheetId/regenerate` | `{}` | `202 { jobId }` | `REGEN_LIMIT` 409, 404 |
| `GET /api/worksheets/:worksheetId` | — | `200 { worksheet: WorksheetDto, items: StudentItemDto[], studentPdfUrl, keyPdfUrl, expiresAt }` | 404 |
| `POST /api/worksheets/:worksheetId/repaper` | `{ paperSize }` | `202 { jobId }` | 404 |
| `POST /api/cycles/:cycleId/difficulty` | `{ value: 'too_hard'\|'too_easy' }` | `204` | 404, 409 if cycle complete |
| `POST /api/worksheets/:worksheetId/items/:itemId/flag-key` | `{ note?: string≤300 }` | `204` | 404 |
| `PATCH /api/cycles/:cycleId` | `{ readAloud: boolean }` | `200` | 404 (before submission only) |

`StudentItemDto = { position, questionText, answerType, choices? }` — **no answers, skill ids, levels or reading bands** (those appear only in the Answer Key PDF and parent-only key view). `WorksheetDto = { id, sheetId, cycleNumber, paperSize, version, isCurrent, verifiedAt }`. PDF URLs are signed (TTL 900 s); a worksheet without `verified_at` is never returned (`NOT_FOUND`).

## 4. Backend implementation (`generate_worksheet` runner)

### 4.1 Planner — pure code (`src/lib/worksheets/planner.ts`), runs before any model call
Input: Child Profile, diagnosis gaps, `skill_mastery`, focus skills, `cycles.parent_difficulty_feedback` of the *previous* cycle (bias), `retest` flags. Output: `AxisPlan`:

```ts
interface PlanItem { position: number; skillId; mathLevel; readingBand; role: 'gap'|'near_mastery'|'stretch'|'review'|'reading_probe'; pairId?: string; pairRole?: 'low_reading'|'target_reading'; }
interface AxisPlan { items: PlanItem[]; domains: string[]; bias: -1|0|1 }
```
Rules (all unit-tested):
1. **Count:** 10 items (fewer only if the catalogue/gap data cannot support 10, minimum 6).
2. **Mix (FR-05):** ~60–70% `gap` (6–7 items; 5 when bias = −1), 20–30% `near_mastery` (2–3; skills with status secure/developing at the current level), 1–2 `stretch|review` (0 when bias = −1; 2 when bias = +1). `stretch` = adjacent level (±1) of a secure skill; `review` = a skill with `retest=true` or a prerequisite after a level drop.
3. **Domains (FR-05):** ≥ 3 distinct domains when the gap plan spans ≥ 3 domains (else as many as exist); no single domain > 5 items.
4. **Diagnostic pairs:** ≥ 2 pairs. A pair = two items, same `skillId` and same `mathLevel`, one at `low_reading` = `max(R1, band−1)` and one at `target_reading` = child's band; shared `pairId`. If `band = R1`, the low item uses R1 with the shortest template (constraint set `R1-min`) and the target uses R1 standard. Pair skills are chosen from gap skills where reading may be a factor (prefer those with prior mixed results).
5. **Axis rule (FR-06):** for each skill, `mathLevel` is the skill's current level; `readingBand` is the child's band. A skill whose math level changed in the previous cycle uses the *unchanged previous reading band*; **at most one `reading_probe` item** (band+1 on a skill with status `secure` at its current level, only when the child's `reading_up_streak < 2` and band < R4) — math level is held, so only the reading axis moves in that item. No item has both `mathLevel` raised above the skill's level and `readingBand` raised above the child's band.
6. **Order:** ascending expected difficulty (easiest `near_mastery` item first as confidence opener; then gap items by `mathLevel` asc; stretch/probe last). Answer positions/structures varied by the generator.
7. **Bias (US-011):** previous cycle `too_hard` → bias −1; `too_easy` → +1; otherwise 0. Never changes levels directly; only mix, magnitudes and stretch count. The `calibration_events` row (`source='parent_feedback'`) is written when the feedback is received.
8. **Retest:** skills with `skill_mastery.retest=true` get one `review` item and the flag is cleared after grading evidence (spec 10).

### 4.2 Generation loop
```
for pass in 1..3:
   request = items still missing/invalid (first pass: all)
   result  = callAgent({ mode:'generate', input:{ plan, historySummary, bands: BAND_CONSTRAINTS, … }, childProfile })
   for each returned item: run checks (§4.3); failing items → "rejected" with reason
   if all plan positions valid: break
   next pass re-requests only rejected positions with the rejection reasons and the avoid-list
if valid items < 6 or domains rule can't be met → fail (retryable AI_INVALID_OUTPUT) — never ship unverified items
if 6 ≤ valid < 10 → ship the valid subset only if coverage rules hold (≥ 3 domains when plan has ≥ 3; ≥ 2 pairs)
```
Progress mapping: planner 10–25, pass 1 55, verification 75, PDFs 90.

### 4.3 Item checks (all must pass — `src/lib/worksheets/checks/`)
| Check | Rule |
|---|---|
| Schema | `generateOutput` zod; position uniqueness; `skillId` in catalogue and equals planned skill; `mathLevel`/`readingBand` equal the plan (model may not change them) |
| **Verification layer 1** | `verification.passed === true` and `method === 'code_interpreter'` (Code Interpreter recomputation in the agent run) |
| **Verification layer 2 (independent)** | If `verification.expression` present: evaluate with `mathjs` in a restricted scope (digits and `+ - * / ( )` only; reject identifiers, `^`, functions) and compare with `correctAnswer` after numeric normalisation. Mismatch → reject. If the expression is missing for `answerType='integer'` → reject |
| Single defensible answer | `ambiguous === false`; question contains exactly one question mark/ask; no "about", "around", "or"; numbers in `numberSet` all appear in the text or working; for `choice` exactly one choice matches |
| Number set consistency | every number in `numberSet` occurs in `questionText`; answer within the skill level's number range from the catalogue levels descriptor (e.g. "within 20" parsed into a bound if present; otherwise skipped) |
| Readability | `checkReadability(text, band)` (§4.4) |
| Age-appropriate content | denylist (violence, weapons, alcohol, brand names, scary themes), names from the neutral name list `src/lib/worksheets/names.ts` (≥ 40 cross-cultural short names), no real people |
| Answer-free student view | `questionText` must not contain `correctAnswer` as a standalone token (except where the answer is given in the problem for another question) |
| Freshness (FR-08) | against `question_history` for the last 4 cycles of this child **and** within-sheet: no equal `question_hash`, no equal `number_set_key`, no equal `context_structure_key` |

`question_hash = sha256(normalise(questionText) )`, `normalise` = lower-case, strip punctuation/extra spaces, replace each name from the name list with `<N>`. `number_set_key` = sorted numbers joined with commas. `context_structure_key` = `lower(context)|structure`.

### 4.4 Readability bands (`src/lib/worksheets/bands.ts`)
| Band | Sentences | Words/sentence (max) | Other constraints |
|---|---|---|---|
| R1 | 1–2 | 8 | sight-word vocabulary list; names ≤ 2 syllables; no irrelevant detail |
| R2 | 2–3 | 10 | simple tense; one idea per sentence |
| R3 | 3–4 | 14 | one irrelevant detail allowed |
| R4 | up to 5 | 16 | up to two irrelevant details; multi-step setup |
KB `iready_interpretation.md` bands override these defaults when present. `checkReadability` counts sentences, words per sentence, rare-word ratio (words not in the band's allowed list, using a bundled 1,000-word grade lexicon ≤ 10% for R1/R2, ≤ 15% R3, ≤ 20% R4), syllable heuristic for names. Out-of-band items are returned to the generator for rewrite (pass 2/3). Target: ≥ 90% of final items in band; items still out of band after pass 3 are dropped.

### 4.5 Persisting and PDFs
1. Sheet ID: `TR-{nick-alnum≤8}-C{cycle}-{4 random A-Z0-9}` generated by `makeSheetId()`; uniqueness enforced by the DB; collision → regenerate suffix.
2. If regenerating: `update worksheets set is_current=false where cycle_id=…`, then insert the new row with `version+1`, then after success set old `superseded_by`. `cycles.regenerations_used` incremented in the same service call **before** enqueueing (so rapid double-click cannot exceed the cap).
3. Insert `worksheet_items`; insert `question_history` rows for every item (history includes superseded sheets).
4. Render PDFs (`src/lib/pdf/`, `@react-pdf/renderer`, fonts embedded — Atkinson Hyperlegible or system sans, ≥ 14 pt body):
   - **StudentSheet**: header (nickname, date, Sheet ID, grade, "Cycle N"; **no scores**), per-item numbered box, answer line with a boxed final-answer rectangle (D6), "Show your work" area ≥ 40% of the item's box height, ≤ 10 items per page-set (single sheet; two pages permitted only if text size/layout needs, but never > 10 items), black-and-white, a Sheet ID also encoded as large text at top-right and repeated in the footer (used by grading), page margins ≥ 12 mm, Letter or A4 (`paper_size`).
   - **AnswerKey**: per question — answer, worked solution, skill name + id, math level, reading band, pair id, and the "reading error or math error?" tip (templated from `pairRole`); a summary table; privacy note. Marked "Parent copy — do not give to child".
5. Upload to `worksheets/{userId}/{childId}/{sheetId}-student.pdf` and `-key.pdf` (service role); store paths.
6. **Last step:** set `worksheets.verified_at = now()` and `cycles.status='ready'`. Any failure earlier leaves `verified_at` null; such sheets are invisible to users.
7. Subscriptions: for `plan='free'` mark `free_cycle_used=true` only when the worksheet becomes `ready` (a failed generation does not consume the free cycle).

### 4.6 Other jobs/endpoints
- `rerender_pdf`: reload items, render both PDFs at the new size, overwrite paths; no model call; updates `worksheets.paper_size`. Result: same `worksheet_id`.
- `flag-key`: sets `key_flagged_wrong=true` (item excluded from calibration; spec 10); first flag on a sheet shows "Thanks — we won't count this question."; a monitor counts flags per week (spec 14).
- `difficulty`: stores `cycles.parent_difficulty_feedback`, writes `calibration_events` (`source='parent_feedback'`, `axis='math'`, reason "Parent said the last sheet was too hard → next sheet eases the mix"); idempotent per cycle.
- `PATCH cycle {readAloud}`: stored; used by grading/calibration (FR-16).

## 5. Frontend implementation
`FocusPicker` (checkboxes grouped by domain, ≥ 1 selected, ≤ 6), `GenerateButton` (disabled while a job is active; shows cap/paywall message from `/api/me/entitlements`), `JobProgress`, `WorksheetPreview` (`PreviewItem` list, `PaperSizeToggle`, `DownloadButtons` opening signed URLs in a new tab with `rel="noopener"`, `RegenerateButton` (disabled after use, tooltip "You can regenerate once per worksheet"), `DifficultyFeedback` (two buttons, then thank-you), `ReadAloudToggle`, `PrintTips`). The preview uses the same layout component tree as the PDF where practical (`SheetLayout` shared token constants) to avoid drift. After success the page polls nothing further; signed URLs refresh through `GET /api/worksheets/:id` when expired.

## 6. Edge cases
| Case | Behaviour |
|---|---|
| Verification failures leave < 6 items | Job fails retryably; message "We couldn't verify all answers, so we didn't give you a worksheet." Previous sheet remains available |
| Duplicate detected against history | Item regenerated; if impossible after pass 3, dropped |
| Fewer than 3 domains available | Allowed only when the gap plan has < 3 domains |
| Free plan, second cycle | `PAYWALL` before any model call |
| Regenerate after first submission | `CONFLICT` (cycle past `ready`) |
| Parent flags a key as wrong | Item excluded from calibration; sheet stays; support metric incremented |
| Paper size change after printing | Content identical; Sheet ID unchanged |
| Name with non-Latin letters | `sheet_id` uses ASCII-folded alnum (`'child'` fallback) |
| Very long question after PDF layout | Layout engine shrinks work area but never below the 40% rule; if impossible, item is shortened by regeneration |
| Generation timeout at ~90 s | Job continues (background); UI shows "taking longer" hint; P95 target 90 s |

## 7. Acceptance criteria
1. A sheet has ≤ 10 items, ≥ 3 domains when the gap plan has ≥ 3, ≥ 2 diagnostic pairs (same skill/level, different reading bands), 1–2 stretch/review items (0 when bias −1).
2. Every answer is verified by Code Interpreter **and** recomputed by the app; a deliberately wrong key in a test fixture is rejected and replaced; `verified_at` is null until all pass.
3. No answer appears in the Student PDF text layer, in `StudentItemDto`, or in any student-visible HTML (automated PDF text scan).
4. No item repeats a question hash, number set or context+structure from the last 4 cycles (simulated 10 cycles).
5. ≥ 90% of items meet the readability band across the eval set.
6. For every skill, math level and reading band are never both raised in the same cycle (property test over random profiles).
7. Student and Key PDFs are separate files, render correctly on Letter and A4, with Sheet ID, ≥ 14 pt text and work space ≥ 40% of item height.
8. Regenerate is allowed exactly once per cycle; the second returns `REGEN_LIMIT`.
9. "Too hard / too easy" is stored separately from graded evidence and changes only the next cycle's mix.
10. P95 generation ≤ 90 s; model + tool cost per generation ≤ $0.08 average.

## 8. Tests
Unit: planner rules (property tests with fast-check), checks (each rejection reason), readability, hashing, Sheet ID, PDF structure. Integration: runner with mocked agent (clean, wrong-key, duplicate, out-of-band, too-few-valid), idempotency, regenerate cap, entitlement gate. E2E: generate → preview → download both PDFs → repaper → regenerate → too hard.
