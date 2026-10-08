// Calibration constants (docs/specs/10-calibration-engine.md §1). Changing a value here changes how quickly
// a child's levels move, so every change should be re-checked with the evaluation suite.
export const CALIBRATION_CONFIG = {
  /** A skill moves at most one level per cycle (FR-13). */
  maxLevelStep: 1,
  /** One item is never enough to label a skill (FR-12). */
  minEvidenceForLabel: 2,
  /** A skill not seen for this many cycles is re-tested. */
  decayCycles: 3,
  /** Cycles in a row of reading-probe success before the reading band rises. */
  readingUpStreakNeeded: 2,
  /** Cycles in a row of reading-attributable trouble before the reading band eases. */
  readingDownStreakNeeded: 2,
  confidence: { medAfterCycles: 2, highAfterCycles: 4, highNeedsCyclesSinceChange: 2 },
  /** Completed cycles without improvement before we gently suggest sharing sheets with the teacher. */
  noImprovementCyclesForTeacherNudge: 6,
  /** How many past cycle scores are kept per skill. */
  scoreHistoryLength: 5,
} as const

// Starting levels used before there is any graded evidence.
export const CALIBRATION_DEFAULTS = {
  /** Level for a skill that is not a gap and has no evidence yet. */
  nonGapLevel: 2,
  /** Level assumed for a strength the diagnosis lists. */
  strengthLevel: 3,
  minLevel: 1,
  maxLevel: 4,
} as const

export function clampLevel(level: number): number {
  return Math.min(CALIBRATION_DEFAULTS.maxLevel, Math.max(CALIBRATION_DEFAULTS.minLevel, Math.round(level)))
}
