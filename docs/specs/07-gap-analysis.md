# 07 — Skills Catalogue and Gap Analysis (Screen 2, top half)

**Covers:** US-009, FR-04, FR-15; EDD §4.6, §7 (`skills_catalog`, `diagnoses`), §8.6; PRD Flow 2 step 1. **Depends on:** 05, 06.

## 1. Skills catalogue

### 1.1 Format
`kb/skills_catalog.json`, produced by `npm run kb:build` from the SME-approved syllabus files and validated by:
```ts
skillCatalogSchema = z.array(z.object({
  skillId,                                  // 'G2.NO.03' = grade 2, domain code NO, sequence 03
  grade: grade,
  domain: z.enum(['Number & Operations','Algebra & Algebraic Thinking','Measurement & Data','Geometry']),
  name: z.string(),
  prerequisites: z.array(skillId),          // must exist in the catalogue; no cycles (checked at build)
  levels: z.object({ M1: z.string(), M2: z.string(), M3: z.string(), M4: z.string() }),
})).min(1)
```
Domain codes (2–4 uppercase letters, matching the SQL check): `Number & Operations → NO`, `Algebra & Algebraic Thinking → AAT`, `Measurement & Data → MD`, `Geometry → GEO`. The domain names are the i-Ready domain names shown in the PRD.

**Production content comes only from the SME-reviewed syllabus (EDD Appendix B #2). The repository ships a clearly labelled development fixture** `tests/fixtures/skills_catalog.dev.json` (8 skills across the four domains, both grades) used by tests and local development; `npm run seed:catalog -- --fixture` loads it, and the app refuses to start in `APP_ENV=production` if the loaded catalogue's `kb_version` equals the fixture's `dev-fixture` marker.

### 1.2 Seeding (`scripts/seed-catalog.ts`)
Upserts `skills_catalog` rows (service role) from `kb/skills_catalog.json`, writing `kb_version`. Fails if any `skill_mastery`/`worksheet_items` reference a skill that would be removed (skills are retired by an `active` flag in a later migration, never deleted).

### 1.3 Runtime access (`src/lib/skills/catalog.ts`)
`getCatalog()` loads the table once per function cold start (cached 10 min); exposes `getSkill(id)`, `skillsForGrade(grade)`, `prerequisitesOf(id)`, `isValidSkillId(id)`, `domainOf(id)`, `adjacentLevel(level, dir)`.

## 2. User flow
After confirmation (spec 06) the `diagnose` job runs; `/plan` shows `JobProgress` ("Reading your results → Matching to skills → Finding the next steps") then the gap view. Returning visits load the latest diagnosis immediately.

Gap view sections (FR-15 order): **Summary** · **Key Data** (grade, scores/placement, window, Lexile or "estimated", **data confidence** badge) · **Concept Gaps** table (Domain | Skill (ID) | Evidence | Gap level | Priority) · **Strengths** · **Recommendations** · **Confidence note** · **Next step** (Generate worksheet). Plain language; jargon explained on first use via `GlossaryTerm` tooltips ("scale score", "placement").

## 3. API
| Method / path | Response | Errors |
|---|---|---|
| `POST /api/children/:childId/diagnoses` `{ reportId }` | `202 { jobId }` | `REPORT_NOT_CONFIRMED`, 404, 429 |
| `GET /api/children/:childId/diagnoses/latest` | `200 DiagnosisDto` | 404 if none |
| `GET /api/diagnoses/:diagnosisId` | `200 DiagnosisDto` | 404 |

```ts
DiagnosisDto = { id, reportId, createdAt, dataConfidence, summary,
  gaps: { domain, skillId, skillName, evidence, gapLevel, priority, suggestedMathLevel, likely }[],
  strengths: { skillId, skillName, note }[], recommendations: string[], unmapped: string[],
  readingBand: { band, estimated }, kbVersion }
```

## 4. Backend implementation (`diagnose` runner)

1. Preconditions: report confirmed (`REPORT_NOT_CONFIRMED`), child exists.
2. **Data confidence (code, not model):** `high` if `confirmed_values.domainResults.length ≥ 1` with placement or score; `medium` if overall placement present (no domains); `low` if only a score. The model's `dataConfidence` is compared; on disagreement the code value wins and a log line is written.
3. Call `diagnose` mode with confirmed values, grade, Child Profile, and the catalogue skill ids for the grade (as a compact list in the prompt so the model must choose from it).
4. **Validation / grounding (FR-04):**
   - every gap/strength `skillId` must exist in the catalogue **and** match the child's grade (or be a prerequisite from grade-1 for a grade-2 child); invalid → moved to `unmapped` with the model's text and `skillId=null`;
   - `likely = true` forced when data confidence is `low` or `medium` (PRD s9 "likely" labelling);
   - ordering: prerequisite chain first (topological order using `prerequisites`), then gap size (`large > moderate > small`); `priority` renumbered 1..n by code;
   - at most 12 gaps, at least 1 strength where evidence exists; empty gaps allowed (child on level) → recommendation "stretch and review plan".
5. Persist `diagnoses` row with `kb_version`, `prompt_version`, `model`.
6. **Seed mastery baseline:** for each gap skill create `skill_mastery` rows if missing with `math_level = suggestedMathLevel` (clamped 1–4) and `status = 'not_enough_evidence'`; strengths get `math_level = min(4, suggested+1)` default M3 if none; other catalogue skills of the grade are *not* pre-created (created lazily when first included in a worksheet at default level M2). Constants in `calibration/config.ts`.
7. Update `children.reading_band` only if still null (estimated) using the agent's `estimatedReadingBand` ⊓ KB table; never overrides a Lexile-derived band.
8. Rebuild Child Profile cache. Progress steps: `reading_profile` 15 → `matching_skills` 55 → `ranking` 85.

## 5. Frontend implementation
`PlanPage` (server) loads the latest diagnosis; client components: `GapSummary`, `KeyDataCard`, `ConceptGapsTable` (sortable by priority only; row expands to show evidence), `SkillTag` (id + name), `PriorityBadge`, `DataConfidenceBadge`, `StrengthsList`, `RecommendationsList`, `ConfidenceNote`, `UnmappedNote` ("We couldn't match X to a skill, so we left it out."), `FocusPicker` (spec 08). `ConceptGapsTable` is a real `<table>` with header scope and, below 640 px, a stacked card layout.
Labels: "likely" appears as a visible `Likely` chip with tooltip "We only had your child's overall result, so we'll check this with the first worksheet."

## 6. Edge cases
| Case | Behaviour |
|---|---|
| Score only | `low` confidence; all gaps `likely`; note explains the worksheet will verify |
| No gaps detected (all strengths) | Plan = review/stretch sheet; message "Your child looks on track — we'll build a confidence-and-stretch worksheet" |
| Agent maps to a skill outside the grade | Moved to `unmapped` |
| KB lacks score→placement cut-off | Agent states labelled estimate (`flags: ['cutoff_missing']`) → shown as "estimate — please check your report" |
| New report/new diagnosis | New row; previous retained; mastery baseline only fills missing skills (never resets existing levels except `baseline_reset` for reading) |
| Diagnose twice for same report | Dedupe returns same/latest diagnosis |
| Catalogue empty or fixture in production | App health check fails; job rejects with `INTERNAL` and alerts |

## 7. Acceptance criteria
1. Every gap shown has a catalogue skill id and name, or appears under "could not match" — never an invented skill.
2. Score-only input yields `low` confidence and every gap labelled "likely"; domain report yields `high`.
3. Gaps are ordered with prerequisites before dependents (property test on random DAGs).
4. Re-running the same report returns the same latest diagnosis without a second charge to caps.
5. Gap analysis completes P95 ≤ 30 s including parse (when from upload).
6. Mastery baseline rows exist for each gap skill after diagnosis.
7. Educators rate ≥ 85% of gap tables "appropriate" (eval, spec 15).

## 8. Tests
Unit: confidence rules, topological ordering, grounding filter. Integration: runner with mocked agent returning invalid/out-of-grade skills; baseline seeding. E2E: manual-score path to gap view with `likely` chips.
