# 10 — Mastery and Two-Axis Recalibration Engine

**Covers:** US-005, US-011, FR-06, FR-12, FR-13, FR-16, FR-18; EDD §4.11, §8.5; PRD s3/s9 calibration rules; Agent-Instructions §4. **Depends on:** 09. **Feeds:** 08 (planner), 11 (results).

The engine is a **pure TypeScript function with no I/O and no model calls**. The model supplies only error classification (spec 09) and wording (`explain` mode). Location: `src/lib/calibration/`.

## 1. Interface

```ts
// config.ts
export const CALIBRATION_CONFIG = {
  maxLevelStep: 1,             // per skill per cycle (FR-13)
  minEvidenceForLabel: 2,      // one item is never enough (FR-12)
  decayCycles: 3,              // re-test after 3 cycles without evidence
  readingUpStreakNeeded: 2,    // cycles of probe success
  readingDownStreakNeeded: 2,  // cycles of reading-attributable errors
  defaultNonGapLevel: 2,
  confidence: { medAfterCycles: 2, highAfterCycles: 4 },
  noImprovementCyclesForTeacherNudge: 6,
};

export interface EngineInput {
  cycleNumber: number;
  readAloud: boolean;
  attributeSkills: boolean;                // false when Sheet ID unmatched
  items: EvidenceItem[];                   // see §2
  mastery: SkillState[];                   // current rows
  reading: ReadingState;
  parentOverrides: { skillId: string }[];  // skills whose level the parent set this cycle
}
export interface EngineOutput {
  mastery: SkillState[];                   // updated
  reading: ReadingState;
  events: CalibrationEvent[];              // each with plain-language reason
  skillResults: SkillResult[];             // per-skill label + evidence summary for the UI
  readingReadout: ReadingReadout;
  flags: string[];                         // e.g. 'suggest_teacher_share', 'retest:G2.NO.03'
}
export function recalibrate(input: EngineInput): EngineOutput;
```
`SkillState = { skillId, mathLevel, status, evidenceCount, secureCycles, notYetCycles, lastSeenCycle, scoreHistory: number[], trend, manualOverride, retest }`. `ReadingState = { band, estimated, confidence, upStreak, downStreak, evidenceCycles }`.

## 2. Evidence selection (what counts)

An `EvidenceItem` is a graded item joined with its worksheet item: `{ skillId, mathLevel (item), readingBand (item), pairId, pairRole, isStretch, isReadingProbe, status (final), errorType, methodSound, confirmed (boolean) }`.

An item is **eligible** only if ALL hold:
1. `confirmed` — `parent_confirmed = true` OR (`needs_review = false`) (spec 09 §4.3). Unconfirmed flagged items are excluded.
2. `key_flagged_wrong = false`.
3. `status != 'blank'` (blank items are reported but are not evidence of skill).
4. `attributeSkills = true` (else the engine returns unchanged state, a flag `no_attribution`, and only counts the cycle for display).

**Math evidence** for a skill = eligible items where `skillId` matches, `isReadingProbe = false`, **and** `item.mathLevel == skill.mathLevel` (at-level evidence). Stretch/review items at adjacent levels produce *informational* results (shown in the UI) but never move levels. Items whose `errorType ∈ {reading_difficulty, attention_copying}` are **not** counted as math incorrect evidence (they are reading/attention-attributable). `calculation_slip` incorrect items count as "slip" evidence (method right).

**Reading evidence** (child-level), only if `readAloud = false`:
- `pairSignal`: for each pair with both items eligible: low-reading correct & target-reading incorrect → `+1 readingLimited`; both correct → `+1 readingOk`; both incorrect → no reading evidence (math barrier).
- `probe`: `isReadingProbe` items: correct → `probeCorrect`, incorrect with `errorType='reading_difficulty'` → `probeFailed`; incorrect with another type → no evidence.
- Items with `errorType='reading_difficulty'` on target-reading items of skills whose status is `secure` or `developing` → `+1 readingLimited` (once per skill).

## 3. Mastery labels per skill (FR-12)

Let at-level eligible items for the skill be `E`, `correctSound = count(status='correct' && methodSound !== false)`, `incorrectConcept = count(status='incorrect' && errorType='concept_gap')`, `evidence = |E|` (excluding items disqualified above).

```
if evidence < 2:
    label = 'secure'  if evidence == 1 && E[0].correct && methodSound !== false && prior.status=='secure' && prior.secureCycles >= 1
          = 'not_enough_evidence' otherwise            // single item is weak evidence
elif correctSound >= 2:                label = 'secure'
elif incorrectConcept >= 2:            label = 'not_yet'     // consistent concept-gap pattern
else:                                  label = 'developing'  // mixed, slips, or weak method
```
`partial` counts as neither correct nor incorrect (supports `developing`). `evidenceCount += evidence`. If label is `not_enough_evidence`, mastery **carries forward unchanged** (prior status kept in `status` only if prior existed; the UI shows "Not enough evidence yet").

## 4. Math axis update per skill (FR-13)

Counters before update: `secureCycles` (consecutive cycles Secure at current level), `notYetCycles`.

```
newSecureCycles = label=='secure' ? secureCycles+1 : (label=='not_enough_evidence' ? secureCycles : 0)
newNotYetCycles = label=='not_yet' ? notYetCycles+1 : (label=='not_enough_evidence' ? notYetCycles : 0)

moveUp   = label=='secure' && (correctSound >= 2 || secureCycles >= 1)   // 2 items w/ sound method, or Secure on 2 separate cycles
moveDown = label=='not_yet' && (notYetCycles >= 1 || (correctSound==0 && evidence >= 3))   // 2 cycles, or a clear concept gap
skip     = parentOverrides.includes(skillId)  // parent set the level this cycle: hold, clear manualOverride
```
- `moveUp` → `mathLevel = min(4, level+1)`; `moveDown` → `max(1, level-1)` and add prerequisite skill ids (from catalogue) as `retest` flags with reason "Re-test the building-block skill".
- Never more than ±1 per cycle (single assignment). On any level change, reset `secureCycles` and `notYetCycles` to 0.
- At level 4 cap / level 1 floor: hold, with reason "already at the highest/earliest level we practise".
- **Decay:** for skills with `lastSeenCycle <= cycleNumber - decayCycles` and no evidence this cycle → set `retest=true` (planner includes one `review` item); flag `retest:{skillId}`.
- `lastSeenCycle = cycleNumber` when evidence ≥ 1.
- `scoreHistory` push (secure=2, developing=1, not_yet=0), keep last 5; skip push on `not_enough_evidence`.
- **Trend:** requires `scoreHistory.length >= 2`; compare the last value to the first of the last three: `>` improving, `<` slipping, `=` steady; else `null`.

## 5. Reading axis update (independent of math)

```
if readAloud || (no reading evidence): reading unchanged (streaks unchanged)
else:
   upCandidate   = probeCorrect >= 1 && probeFailed == 0 && readingLimited == 0
   downCandidate = readingLimited >= 1 || probeFailed >= 1
   upStreak   = upCandidate   ? upStreak+1   : 0
   downStreak = downCandidate ? downStreak+1 : 0
   evidenceCycles += 1
   if upStreak   >= 2 && band < R4:  band += 1; reset streaks     // probes correct across 2 cycles at known-secure skills
   if downStreak >= 2 && band > R1:  band -= 1; reset streaks     // reading-attributable errors repeat at the band
   (never both; a math-only error pattern never touches streaks)
confidence: low → med when evidenceCycles >= 2; → high when evidenceCycles >= 4 && no band change in the last 2 evidence cycles; a band change resets to 'med'.
```
`estimated` stays `true` until a Lexile is entered or `confidence` reaches `med` (then the UI shows "calibrated from worksheets"). **Rule: math-only errors never change the reading band (FR-06/PRD).** A reading band move and a math level move on the same skill in the same cycle is impossible by construction (planner prevents dual raises; the engine asserts and, if input violates it, applies only the math move and logs `axis_conflict`).

New Lexile (spec 06/02) resets the anchor outside the engine (`baseline_reset`) and zeroes streaks.

## 6. Parent overrides and feedback

**API:** `PATCH /api/children/:childId/skills/:skillId` body `{ mathLevel: 1..4 }` (strict) → `200 SkillMasteryDto`; errors 400, 404 (child or skill row absent). Allowed any time except while a `recalibrate` job for the child is running (`CONFLICT`). Writes via service role after the ownership check.

- **Manual level override** (`PATCH /api/children/:id/skills/:skillId {mathLevel}`) sets `math_level`, `manual_override=true`, writes event `parent_override`; the next engine run holds that skill and clears the flag.
- **Too hard / too easy** does not enter the engine; it biases the next planner mix (spec 08 §4.1 rule 7) and is logged as `parent_feedback`.

## 7. Events and wording
Each change produces `CalibrationEvent { axis, skillId?, fromLevel, toLevel, reason, source:'rules' }` with a **template reason** (e.g. "Got 2 of 2 regrouping problems with a clear method — moving up to level 3."; "Missed 3 of 4 regrouping problems the same way — adding a gentler step next time."). The `recalibrate` runner then calls `explain` mode with the events (levels as input) to produce friendlier prose; if the output mentions a skill/level not in the input, use the templates. Language: "still building", "next step"; never "weak".

`skillResults[]` per skill: label, plain-language evidence ("2 of 2 correct, method shown"), trend, informational stretch results. `readingReadout`: one of `reading_looks_fine`, `reading_may_be_limiting`, `not_enough_evidence`, each with a sentence and the pair counts used.

## 8. Teacher-share nudge
If a child has ≥ 6 completed cycles and `scoreHistory` shows no improvement (all gap skills `not_yet|developing` with trend ≠ improving), add flag `suggest_teacher_share` — shown once as a gentle message ("Consider sharing these sheets with your child's teacher"). No diagnostic language.

## 9. `recalibrate` runner (`src/lib/jobs/runners/recalibrate.ts`)
1. Preconditions: cycle `graded|needs_review`; `finalize` rules (unconfirmed allowed only with `skipUnconfirmed`).
2. Load items (joined), mastery, reading state, `readAloud`, overrides.
3. `recalibrate(input)` → output.
4. In one transaction (RPC or sequential with the status marker last): upsert `skill_mastery`; update `children.reading_*`; insert `calibration_events`; write `cycles.summary`, `calibration_text`, `status='complete'`, `completed_at`; rebuild `profile_summary`.
5. Record `usage` for the explain call; progress `rules` 40 → `explaining` 70 → `saving` 90.
Idempotent: if `cycles.status='complete'` return the stored result.

## 10. Edge cases
| Case | Behaviour |
|---|---|
| All items unconfirmed + skip | Every skill `not_enough_evidence`; no level or band moves; message explains why |
| Same skill appears 3× in one sheet | Evidence counts all eligible at-level items |
| Stretch item correct | Informational "ready for more" note; no level move |
| Level change last cycle | Evidence for the new level starts at zero; `secureCycles` already reset |
| Read-aloud ticked | No reading evidence; math continues |
| Key flagged wrong | Item ignored; skill may become `not_enough_evidence` |
| Conflicting reasons (pair says reading, method says concept) | Pair rule applies unless `methodSound=false` (spec 09 §4.2) |
| Missing skill_mastery row | Created with default level (`defaultNonGapLevel`) before evaluation |

## 11. Acceptance criteria
1. No skill's `mathLevel` changes by more than 1 in a cycle (property test, 10,000 random inputs).
2. A level rises only on `correctSound ≥ 2` or Secure on two consecutive cycles; falls only on Not-yet for two cycles or a clear concept gap (`0` correct with ≥ 3 items).
3. Reading band is unchanged for any input where all errors are math-attributable or `readAloud=true` (property test).
4. Unconfirmed flagged items and key-flagged items never alter any state (differential test with/without them).
5. A single item can never produce `secure` or `not_yet` (except the documented strong-prior case).
6. Output is deterministic: same input → same output (snapshot tests).
7. Every state change has a calibration event with a reason, shown on the Progress tab.
8. Simulated 12-cycle profiles show 100% rule compliance (spec 15 recalibration sanity).

## 12. Tests
`tests/unit/calibration/*.test.ts` with table-driven cases for each label and move, fast-check properties above, snapshot fixtures for end-to-end `EngineInput → EngineOutput`, and an integration test of the runner against local Supabase.
