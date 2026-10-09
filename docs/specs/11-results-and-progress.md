# 11 — Results, Recommendations and Progress Dashboard (Screen 3, second half)

**Covers:** US-006, US-005 (display), FR-12, FR-15, FR-19; EDD §4.11, §4.12, §9.5, §9.6; PRD Flow 3 steps 4–6. **Depends on:** 09, 10.

## 1. User flow
1. After **Finish review** the `recalibrate` job runs (`JobProgress`: counting up what your child showed → adjusting the next worksheet → writing it up).
2. **Results** (`/children/[id]/results`, cycle view) shows in order (FR-15): **Summary** · **Item Results** table · **Mastery by Skill** · **Reading vs Math** read-out · **Recommendations** (next-cycle focus + 2–3 short at-home activities that need no worksheet) · **What changes next** (calibration update in plain language) · **Next step** (button **Next worksheet**) and the **disclosure banner** (FR-19) and AI disclosure.
3. **Next worksheet** → `POST …/worksheets` for the same diagnosis (or latest) → spec 08.
4. **Progress** tab (`/children/[id]/progress`): per-domain trend across cycles, per-skill timeline, "why it changed" list, reading band history.
5. Tabs on the results page switch between past cycles (cycle selector).

## 2. Data
Reads `cycles`, `graded_items` + `worksheet_items`, `skill_mastery`, `calibration_events`, `feedback`. No new tables. `cycles.summary` and `calibration_text` are written by the recalibrate runner (spec 10 §9). Recommendations and at-home activities are produced in `explain` mode output (extended with `{ recommendations: string[≤4], activities: string[2..3] }`) and validated; fallbacks are templates keyed by skill domain (`src/lib/results/activity-templates.ts`) so the page never lacks content.

## 3. API
| Method / path | Response | Errors |
|---|---|---|
| `GET /api/cycles/:cycleId/results` | `ResultsDto` | 404; `409 NOT_COMPLETE` if the cycle is not `complete` (returns current status so the UI can resume review) |
| `GET /api/children/:childId/cycles` | `{ cycles: [{ id, number, status, sheetId, date, headline }] }` | 404 |
| `GET /api/children/:childId/progress` | `ProgressDto` | 404 |
| `POST /api/feedback` `{ worksheetId, rating 1–5, comment? ≤ 500 }` | `201`; upsert on `(user, worksheet)` | 400, 404 |

```ts
ResultsDto = {
  cycle: { id, number, sheetId, completedAt },
  summary: string,
  items: { position, skillId, skillName, mathLevel, readingBand, result: 'correct'|'partial'|'incorrect'|'blank',
           errorType: ErrorType|null, extractionConfidence: number, counted: boolean, notCountedReason?: 'unconfirmed'|'key_flagged'|'no_attribution' }[],
  mastery: { skillId, skillName, label, evidence: string, trend: 'improving'|'steady'|'slipping'|null, levelChange?: { from: number, to: number } }[],
  readingReadout: { verdict: 'reading_looks_fine'|'reading_may_be_limiting'|'not_enough_evidence', text: string, band: { from: string, to: string } },
  recommendations: string[], activities: string[],
  calibration: { text: string, events: { axis, skillName?, from, to, reason }[] },
  flags: string[],               // e.g. 'suggest_teacher_share'
  disclosure: string,            // DISCLOSURE constant, always present
}
ProgressDto = {
  domains: { domain: string, points: { cycle: number, date: string, score: number /* mean of skill score_history 0..2 */, skillsCovered: number }[], latestTrend: 'improving'|'steady'|'slipping'|null }[],
  skills: { skillId, name, domain, currentLevel, status, trend, history: { cycle: number, label: string, level: number }[] }[],
  changes: { date, cycle, axis, text }[],            // calibration_events newest first
  reading: { band, estimated, confidence, history: { cycle: number, band: string }[] },
  baseline: { window, overallScore, placement, date }
}
```
Domain `score` = mean of the per-skill cycle scores for skills in the domain that had evidence in that cycle; domains with no evidence in a cycle produce no point (gap in line, not zero). Domain names are the i-Ready domain names (Number & Operations, Algebra & Algebraic Thinking, Geometry, Measurement & Data).

## 4. Backend implementation
`results.service.ts` composes `ResultsDto` from stored data only (no model call at read time). `progress.service.ts` aggregates from `cycles`/`skill_mastery`/`calibration_events` using SQL views or queries (≤ 5 queries; indexed by `child_id`). All read through the user client (RLS). The `disclosure` string is added server-side so no client path can omit it.

Cycle `headline` for the list: first sentence of `summary`.

## 5. Frontend implementation
| Component | Notes |
|---|---|
| `ResultsPage` | Server component loads `ResultsDto`; client sub-components below |
| `ResultSummary` | 2–4 sentences, encouraging, specific about what went well first |
| `ItemResultsTable` | `<table>`; columns Q, Skill, M level, R level, Result, Error type, Confidence; "not counted" rows muted with reason; result uses icon + text (never colour alone); Edit action opens the review confirm for any item (spec 09 §4.3) until finalised |
| `MasteryBySkill` | `StatusBadge` (Secure / Developing / Not yet / Not enough evidence) + evidence sentence + trend arrow with text |
| `ReadingVsMathReadout` | Two short paragraphs, one per axis, from `readingReadout` and skill results |
| `CalibrationUpdate` | "What changes next" list from events (`reason` text) |
| `RecommendationsList`, `AtHomeActivities` | |
| `DisclosureBanner` | Always rendered at the bottom of every results view: "Practice support, not an official assessment. Ask your child's teacher for the full picture." plus the AI disclosure; not dismissible; has `role="note"` |
| `TeacherShareNudge` | Only when `flags` has `suggest_teacher_share`; shown once (dismiss stored in `localStorage` per child) |
| `NextWorksheetButton` | Starts the next cycle; surfaces `PAYWALL` as the pricing stub (spec 12) |
| `RateWorksheet` | 1–5 stars + optional comment |
| `ProgressPage` | `DomainTrendChart` (line per domain; text summary under each chart for a11y), `SkillTimeline`, `ChangeReasonList`, `ReadingBandCard`; follows `dataviz` palette rules: colours from `docs/design.md` tokens, no colour-only encoding, accessible data table fallback ("View as table") |

Copy rules (lint rule `no-banned-words` over `src/**/*.tsx` strings): "weak", "behind", "failing", "bad", "slow" are disallowed in UI copy; use "still building", "next step", "ready for more".

## 6. Edge cases
| Case | Behaviour |
|---|---|
| Cycle not complete | Redirect to review queue or progress screen based on status |
| All items unconfirmed | Results explain "We didn't count these yet" with a button back to review |
| One cycle only | Progress shows points without trends ("Trends appear after a couple of worksheets") |
| Domain with no evidence yet | "Not enough evidence yet" row; no line |
| Level moved down | Wording "adding a gentler step", never "demoted" |
| `no_attribution` cycle | Banner "We scored answers but couldn't match skills"; mastery section hidden |
| Teacher nudge repeated | Shown once per child |
| New iReady report arrives | Progress shows a baseline marker and "where the worksheet picture and your latest report agree/differ" note, with explicit sentence that worksheet work doesn't change an iReady score (PRD) |
| Very long skill names | Truncate with tooltip, full text in table row expansion |

## 7. Acceptance criteria
1. Results appear in the specified order with Summary, Item Results, Mastery by Skill, Reading-vs-Math read-out, Recommendations, Calibration update, Next step.
2. The disclosure text (FR-19) is present on every results view and cannot be removed by data (server-injected).
3. Mastery labels match the engine's output for the same cycle; labels never say weak/behind.
4. The calibration update is plain-language and every level or band move shows its reason (US-005, US-006).
5. Progress shows per-domain trend across ≥ 2 cycles using i-Ready domain names, with a text alternative and table view.
6. Items excluded from calibration are visibly marked "not counted" with the reason.
7. Rating a worksheet persists once per user per worksheet (upsert).
8. Page passes axe checks (serious/critical = 0) at 375 px and 1280 px.

## 8. Tests
Unit: `ResultsDto` composition from fixtures, domain score aggregation, banned-words lint. Integration: endpoints against seeded cycles incl. unconfirmed/flagged items; disclosure always present. E2E: complete a cycle then view results and progress; second cycle adds a data point.
