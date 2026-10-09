# 09 — Photo Grading and Parent Review Queue (Screen 3, first half)

**Covers:** US-003, US-004, FR-09 (Sheet ID), FR-10, FR-11, FR-16; EDD §4.9, §4.10, §8.6, §9.5; PRD Flow 3 steps 1–3. **Depends on:** 03, 04, 05, 08.

## 1. User flow (route `/children/[childId]/results`)
1. If the current cycle is `ready`, the page opens on **Upload completed sheet**; capture guidance: flat surface, good light, whole page, no shadows, cover the child's name if you can.
2. Parent adds 1–4 photos (camera or gallery), ticks **"I read the questions aloud"** if applicable (FR-16), previews, then **Grade this sheet**. Client pre-check (spec 03) may ask for a retake.
3. `grade_sheet` job runs (`JobProgress`: checking photo → reading answers → checking answers).
4. Outcomes:
   - `PHOTO_QUALITY` → retake screen with specific tips (blurry/dark/cut off) and nothing stored beyond the temporary upload (§5 deletion).
   - Sheet ID mismatch/unreadable → parent confirms the sheet from a list of their open worksheets (`SheetPicker`); if still unknown → "Score answers only" option (no skill attribution) with a visible notice.
   - Success with flagged items → **Review queue**; with none → straight to results (spec 11).
5. **Review queue:** one `ReviewCard` at a time (or a list on desktop): cropped handwriting image beside the extracted value ("Is this **12** or **17**?"), quick-pick of top alternatives, a numeric/text field, and **Confirm** (one tap if the extracted value is right). A per-card "Not sure / skip" leaves the item unconfirmed (excluded from mastery). Progress "3 of 5 checked". **Finish review** enabled when all are confirmed or the parent chooses "Skip remaining" (confirmation dialog explaining skipped answers won't count yet).
6. **Finish review** → `POST /api/cycles/:id/finalize` (spec 10).

## 2. Database
`graded_items` (see SQL): system judgement columns are immutable (trigger); the parent changes `parent_confirmed`, `parent_answer`, `final_status`, `overridden`, `confirmed_at`. `uploads` holds sheet photos and crops (`kind='item_crop'`). `cycles.status`: `ready → grading → needs_review|graded → complete`. `cycles.read_aloud` stored on submission.

## 3. API
| Method / path | Request (strict) | Response | Errors |
|---|---|---|---|
| `POST /api/worksheets/:worksheetId/submissions` | `{ uploadIds: uuid[1..4], readAloud: boolean, confirmSheet?: boolean, attributeSkills?: boolean }` | `202 { jobId }` | 404, `ALREADY_GRADED` 409, `CONFLICT` if worksheet not current/ready, `UNSUPPORTED_MEDIA` |
| `GET /api/cycles/:cycleId/review-queue` | — | `200 { total, remaining, items: [{ gradedItemId, position, cropUrl, extractedAnswer, alternatives: string[], confidence }] }` | 404 |
| `POST /api/graded-items/:id/confirm` | `{ answer: string≤40, status?: itemStatus }` | `200 GradedItemDto` | 400, 404, 409 if cycle complete |
| `POST /api/cycles/:cycleId/finalize` | `{ skipUnconfirmed?: boolean }` | `202 { jobId }` | `REVIEW_PENDING` 409, 404 |

`status` omitted on confirm → server recomputes correctness of `answer` against the stored key via `compareAnswer()` (§4.4) so one tap suffices; supplied `status` is accepted (parent can mark a partial/incorrect/correct explicitly). Result: `final_status`, `parent_confirmed=true`, `overridden = final_status != system_status OR parent_answer != extracted_answer`.

## 4. Backend implementation (`grade_sheet` runner)

### 4.1 Steps
1. **Preconditions:** worksheet `is_current`, `verified_at` set, cycle `ready`; uploads belong to the user, are `completed_sheet`, completed. Set `cycles.status='grading'`; `cycles.read_aloud` saved.
2. **Quality gate (server):** `sharp` metrics (spec 03 §5); all pages `unreadable` (score < 0.35) → fail `PHOTO_QUALITY` (not retryable), delete those uploads immediately, cycle back to `ready`. One poor page among several is allowed with a flag.
3. Normalise images (auto-orient, ≤ 2000 px, JPEG/PNG).
4. **Load key from DB** (never from the model): items with `position`, `skill_id`, `correct_answer`, `accepted_answers`, `answer_type`, metadata (math level, band, pair id).
5. **Two-step grading in one agent run (`grade` mode, grader deployment):** input = images + the *key table* (positions + expected answers + question text; **no worked solutions**) + Child Profile. Instructions (in `modes/grade.md`): (1) transcribe each handwritten final answer and visible work for every position with `extractionConfidence` (0–1) and a bounding box; (2) compare against the key; (3) classify status and error type (FR-11) using the pair metadata; (4) read the Sheet ID and report `sheetIdConfidence`. Handwriting guidance: consider digit reversals (5/S, 6/9, 1/7), erased marks, and answers written in the work area vs the answer box; never silently guess — lower the confidence.
6. **Sheet ID check:** model's `sheetId` vs `worksheets.sheet_id`: equal (case-insensitive) → proceed; differs or confidence < 0.8 → `SHEET_MISMATCH` path: job succeeds with `result.needsSheetConfirmation=true` and **no graded items are persisted** until the parent confirms via `submissions` retry with `confirmSheet=true` (accept the selected worksheet) or `attributeSkills=false` (score answers only; `graded_items.error_type` kept but cycle flagged `no_attribution`, and spec 10 skips skill/reading updates).
7. **Server-side re-judgement (authoritative):** for each item, `status` is recomputed in code: `compareAnswer(extracted, key)` →
   - blank/null → `blank`; equivalent after normalisation → `correct` (or `partial` if the model reports right method + arithmetic slip, or right number with missing/wrong unit and the key's `answer_type='text'`); else `incorrect`.
   The model's status is kept only as `method_evidence` context; when model and code disagree, the **code result is stored** and `needs_review=true`.
8. **Confidence routing (FR-10):** `needs_review = extractionConfidence < EXTRACTION_CONFIDENCE_THRESHOLD (0.85) OR status disagreement OR (blank AND model says 'illegible')`. Items flagged for review get a crop: `sharp.extract` of the normalised bounding box with 15% padding, stored as `item_crop` upload (`uploads/{userId}/{childId}/item_crop/{uuid}.jpg`), path in `graded_items.crop_path`. Missing bounding box → crop the whole page strip estimated from the item position (fallback) and set confidence ≤ 0.5.
9. Insert `graded_items` (system columns frozen). The review-queue endpoint derives the quick-pick `alternatives` at read time with `confusionAlternatives(extracted)` (swap 1↔7, 5↔6, 6↔9, 3↔8, 0↔6); nothing extra is stored.
10. Cycle status → `needs_review` (any `needs_review` item) else `graded`. Progress: `checking_photo` 15 → `reading_answers` 65 → `checking_answers` 90.
11. **Image lifecycle:** original sheet uploads stay until the 30-day retention (or parent delete) so the parent can re-check; crops follow the same expiry.

### 4.2 Error typing (FR-11)
Allowed values: `calculation_slip`, `concept_gap`, `reading_difficulty`, `attention_copying`, `unclear`. Post-processing rules in code:
- `status='correct'` → `error_type = null`.
- If the item belongs to a pair and the *low-reading* partner is correct while the target-reading partner is incorrect → force `reading_difficulty` on the target item (evidence rule) unless the model gave `concept_gap` with strong method evidence (`method_sound=false`).
- If both partners are wrong → leave the model's type; prefer `concept_gap` over `reading_difficulty`.
- "Unclear" is accepted and never forced into another type.

### 4.3 Parent confirmation (`confirmGradedItem`)
User-client update under RLS. Server checks cycle status in (`needs_review`, `graded`), item `needs_review=true` (non-flagged items can also be corrected through the same endpoint: "Edit" in the results table). Re-runs `compareAnswer` when `status` not supplied. Items skipped remain `parent_confirmed=false`.
**Rule:** an item with `needs_review=true` and `parent_confirmed=false` is excluded from mastery. An item with `needs_review=false` counts as system-confirmed unless the parent edits it.

### 4.4 `compareAnswer(extracted, item)` (`src/lib/grading/compare.ts`)
Normalise: trim, lower-case, remove units/commas/trailing period, map number words (zero–twenty… to digits, "one hundred" etc.), `×`, `−` normalisation; compare numerically for `integer`; `accepted_answers` list equality for `text`; letter match for `choice`. Returns `{ status: 'correct'|'incorrect'|'blank', unitMissing: boolean }`.

## 5. Frontend implementation
`PhotoCapture` (file input with `capture`, thumbnails, `ReadAloudToggle`, pre-check feedback via `PhotoTips`), `SheetPicker`, `AttributionNotice`, `ReviewQueue` / `ReviewCard` (image with zoom on tap, `AnswerField` with large 48 px touch targets, alternatives as chips, Confirm / Skip), `ReviewProgress`, `FinishReviewButton`. State: TanStack Query `['review-queue', cycleId]`; confirm mutation optimistic with rollback; keyboard shortcuts (Enter confirm). Cropped images are loaded via signed URLs (`GET /api/uploads/:id/url`), cached for TTL. Strictly encouraging copy: never "wrong"/"bad" to the parent about the child; result words are "got it", "still building", "next step".

## 6. Edge cases
| Case | Behaviour |
|---|---|
| Blurry/dark/partial photo | Client precheck; server `PHOTO_QUALITY`; retake tips; nothing graded |
| Sheet ID unreadable | `SheetPicker` of open worksheets; else answers-only with notice |
| Photo of a different child's sheet | Sheet ID belongs to another cycle/child of same user → mismatch prompt lists the matching child/cycle; belongs to another user → treated as unreadable (no cross-user leak) |
| Pages out of order / duplicate pages | Model identifies positions; duplicates ignored; missing positions → `blank` flagged `needs_review` ("we couldn't find Q7") |
| Child wrote answer in the work area, not box | Extracted from work with lower confidence; flagged |
| Erasures, reversed digits | Lower confidence → queue |
| Units missing (text answers) | `partial` with explanation in item results |
| Parent confirms nonsense (e.g. 99999) | Max length 40, numeric bounds 0–10,000 for integer types; accepted otherwise |
| Parent never finishes review | Cycle stays `needs_review`; reminder banner on return; no mastery update |
| Re-upload after grading | `ALREADY_GRADED`; to re-grade the parent must delete the sheet photos (confirmation) which resets the cycle to `ready` and discards graded items **before** any recalibration happened; after finalize it is disallowed |
| Key flagged wrong by the parent | Item shown as "not counted" in results and ignored in calibration |
| Child deleted during grading | `CHILD_DELETED` |

## 7. Acceptance criteria
1. Photos in JPEG/PNG/HEIC are accepted; HEIC is converted client-side; grading P95 ≤ 60 s.
2. Each item returns extracted answer, status, error type, extraction confidence; the Sheet ID is read and matched; mismatch/unreadable follow the documented paths.
3. Items below 0.85 confidence (or with model/code disagreement) appear in the review queue with a crop beside the extracted value; confirming takes one tap.
4. **Unconfirmed `needs_review` items never influence mastery** (verified in spec 10 tests).
5. Handwriting extraction ≥ 92% exact over the eval set and > 90% of extraction errors are flagged low-confidence (spec 15).
6. A blurry photo is never graded; the parent receives retake guidance.
7. Reading-vs-math attribution follows the pair rule in §4.2.
8. System judgements remain immutable after parent edits (DB trigger test).
9. Another user cannot read or confirm these items (RLS/API tests).

## 8. Tests
Unit: `compareAnswer` (number words, units, equivalents), confidence routing, pair attribution, confusion alternatives. Integration: runner with mocked grader outputs (clean, low-confidence, wrong sheet id, missing positions, model/code disagreement), crop generation, confirm flow, immutability trigger. E2E: upload fixture → review 3 flagged items → finish.
