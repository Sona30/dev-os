# 06 — Intake: Results Entry, Report Parsing and Confirmation (Screen 1)

**Covers:** US-001, US-008, FR-01, FR-02, FR-03, FR-18; EDD §4.3–4.5, §9.3; PRD Flow 1. **Depends on:** 02, 03, 04, 05.

## 1. User flow (route `/children/[childId]/setup`)

```
Choose input method ─┬─ Report: upload PDF/images → "Reading your report…" → Confirm values
                     └─ Manual: placement and/or scale score, window, optional Lexile ──▶ Confirm values
Optional: Lexile (both paths)  →  Confirm checkbox  →  Continue  →  diagnosis job  →  /plan
```
1. Tabs: **Upload report** (recommended: "lets us target exact concepts") | **Enter score or placement**.
2. Upload tab: `ReportDropzone` (spec 03) → thumbnails → **Read my report** → creates the report (`POST …/reports {uploadIds}`) → `parse_report` job → on success the Confirm step.
3. Manual tab fields: Placement (select: the placement list for the chosen grade from `kb`-generated `placements.generated.ts`, e.g. "Mid Grade 1", "One Grade Level Below"), Overall scale score (number), Assessment window (BOY/MOY/EOY, optional), Lexile (optional). **At least one of placement/score is required** (FR-01). Submit → `201` report (`parse_status='manual'`).
4. **Confirm values** (US-008): editable `FieldRow`s for window, overall score, placement, each domain's placement/score; per-field `ConfidenceBadge` (≥ 0.85 "read clearly", 0.5–0.85 "please check", < 0.5 field cleared with "We couldn't read this — enter it"). Lexile field. A required checkbox "These values match my child's report". **Continue is disabled until checked** and all required values exist.
5. Continue → `POST /api/reports/:id/confirm` → `diagnose` job → on success navigate to `/plan`.

## 2. Database
`reports` (see SQL): `parsed_values` (raw agent output, immutable), `confirmed_values` (final), `confirmed_at`, `parse_status`. `children.lexile`, `reading_band`, `reading_band_estimated` updated on confirm.

`confirmed_values` shape (`confirmedValuesSchema`):
```ts
{ window: 'BOY'|'MOY'|'EOY'|null, overallScore: number|null, placement: string|null,
  domainResults: { domain: string; placement: string|null; score: number|null }[],
  lexile: number|null }
// refine: overallScore != null || placement != null || domainResults.length > 0   (FR-01)
```

## 3. API

| Method / path | Request (strict) | Response | Errors |
|---|---|---|---|
| `POST /api/children/:childId/reports` | `{ uploadIds: uuid[1..5] }` **or** `{ manual: { overallScore?, placement?, window?, lexile? } }` | upload → `202 { jobId, reportId }`; manual → `201 { report }` | 400, 404, `CONTRADICTORY_INPUT` 422, `UNSUPPORTED_MEDIA` |
| `GET /api/reports/:reportId` | — | `200 ReportDto { id, source, parseStatus, parsed, confirmed, confirmedAt, fieldConfidence }` | 404 |
| `POST /api/reports/:reportId/confirm` | `{ values: confirmedValues }` | `200 { report, jobId }` (diagnose job queued) | 400, 404, `NOT_PARSED` 409 (still `pending`), 422 `CONTRADICTORY_INPUT` |
| `POST /api/children/:childId/diagnoses` | `{ reportId }` | `202 { jobId }` | `REPORT_NOT_CONFIRMED` 409 |

Validation (service `reports.service.ts`):
- **Placement vs grade** (`CONTRADICTORY_INPUT`): a placement that names a grade different from the child's grade by more than the allowed offset is rejected. Rules, from the KB placement table: "Early/Mid/Late Grade N" must satisfy `N ∈ {grade-2 … grade+1}`; "One/Two Grade Level(s) Below/Above" always valid; unknown strings are accepted only if listed in `placements.generated.ts` for that grade. Message: "That placement doesn't match the grade you chose."
- **Score plausibility**: integer 0–1000 (DB bound); the KB's score-to-placement ranges (if present) are used for a *warning* "this score looks unusual for Grade N" (not blocking).
- **Window**: if absent, the UI asks; if still absent, stored `null` and the diagnosis labels "window unknown".
- Contradiction between score and placement beyond the KB ranges → soft warning on the Confirm step; parent decides.

## 4. Backend implementation

`parse_report` runner:
1. Load `reports` + `uploads` (confirmed, owner's, ≤ 5). Reject if any `kind != 'report_page'`.
2. Server-side `sharp` normalisation: auto-orient, ensure long edge ≤ 2000 px, PNG/JPEG output (never HEIC).
3. `callAgent({ mode: 'parse', images, input: { grade, child_nickname } })`.
4. If `status='rejected_input'` → job `succeeded` with `result.rejected=true`, `reports.parse_status='failed'`; UI shows "That doesn't look like an i-Ready Math report" + manual entry.
5. Else store `parsed_values`, `field_confidence`, copy values into `overall_score`, `placement`, `domain_results`, `assessment_window`; set fields with confidence < 0.5 to `null` in `confirmed_values` draft; `parse_status='parsed'`.
6. Progress: `reading_pages` 20 → `extracting` 60 → `validating` 90.
Image deletion: report-page uploads remain until retention (30 days) so the parent can re-check; parent may delete sooner (spec 13).

`confirmReport()`:
1. Validate `confirmedValuesSchema`; check `parse_status ∈ {parsed, manual}` else `NOT_PARSED`.
2. Write `confirmed_values`, `confirmed_at = now()` (user client allowed by RLS; the DB trigger blocks tampering with `parsed_values`).
3. Update child: `lexile`, `reading_band`/`estimated` via `deriveReadingBand` (spec 02 §4.3); emit `calibration_events` (`baseline_reset`) if a band existed and changed.
4. Rebuild `children.profile_summary`; enqueue `diagnose`.

**Gate:** `diagnose` runner and `POST …/diagnoses` both require `reports.confirmed_at is not null` (server check — not UI-only).

## 5. Frontend implementation

| Component | File |
|---|---|
| `SetupPage` | `app/(app)/children/[childId]/setup/page.tsx` — server component loads child + latest report |
| `ResultInput` | `components/intake/ResultInput.tsx` (Radix Tabs) |
| `ReportDropzone`, `PageThumbnails` | `components/intake/` |
| `ManualScoreForm` | `components/intake/ManualScoreForm.tsx` (RHF + zod; `PlacementSelect`, `ScoreInput`, `WindowSelect`, `LexileInput`) |
| `ParsedValuesConfirm` | `components/intake/ParsedValuesConfirm.tsx` (`FieldRow`, `ConfidenceBadge`, `ConfirmCheckbox`) |
| `CoverNameTip` | `components/intake/CoverNameTip.tsx` |

State: wizard step in Zustand (`useIntakeStore`: `step`, `reportId`, `jobId`) persisted to `sessionStorage` (ids only). The 90 s P95 budget (score entry → worksheet) is shown as an indeterminate progress with step labels.

Copy: "Reading your report…" / "Check these values — you know your child's report best." Low-confidence fields are outlined with the warning token from `docs/design.md` and have an `aria-describedby` hint.

## 6. Edge cases

| Case | Behaviour |
|---|---|
| Not an i-Ready report | `rejected_input` → friendly message + manual entry |
| Reading/ELA report uploaded | Agent flags `wrong_subject`; same message |
| Multi-page report with domain page missing | Domains empty, `dataConfidence` Medium downstream; UI notes "No domain details found" |
| Two windows on one report | Agent returns most recent in `window` and notes `multiple_windows` flag → UI asks parent to pick |
| Parsed score disagrees with placement per KB | Soft warning |
| Parent edits a field to a very different value | Allowed; stored in `confirmed_values`; `parsed_values` retained for eval |
| Re-uploading a newer report (MOY after BOY) | Creates a new `reports` row; latest confirmed is baseline for new cycles; prior diagnosis retained; calibration `baseline_reset` events recorded (PRD: reset anchor) |
| Confirm clicked twice | Idempotent: second call returns the existing diagnose job |
| Parse job fails 3× | "Enter values manually" button prominent |
| Child deleted mid-parse | Runner aborts `CHILD_DELETED` |

## 7. Acceptance criteria
1. Form rejects submission with no report, score or placement (client and `422`/`400` server).
2. A placement for the wrong grade returns `CONTRADICTORY_INPUT` with the specified message.
3. PDF and image reports parse into editable fields; fields with confidence < 0.5 are blank; generation is impossible until the checkbox is ticked (server rejects `diagnose` without `confirmed_at`).
4. Parse P95 ≤ 30 s (spec 15 latency test); manual path creates the report instantly.
5. Optional Lexile sets `reading_band` with `estimated=false`; absence yields an "estimated" band label.
6. A non-i-Ready image never creates a diagnosis and does not consume the free cycle.
7. Field-level parsing accuracy meets the eval targets (≥ 95% score/placement, ≥ 90% domains).

## 8. Tests
Unit: placement/grade validator, confirmedValues refine, confidence-to-field mapping. Integration: parse job with mocked agent (ok, rejected, low-confidence), confirm gate, re-baseline. E2E: manual path; upload path with fixture; wrong-grade placement error.
