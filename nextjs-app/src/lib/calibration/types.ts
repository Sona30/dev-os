import type { ErrorType, ItemStatus } from '@/lib/grading/types'
import type { MasteryStatus, ReadingBand } from '@/lib/schemas/common'

// Inputs and outputs of the calibration engine (docs/specs/10 §1). The engine is pure: no I/O, no model calls.

export type Trend = 'improving' | 'steady' | 'slipping' | null
export type ReadingConfidence = 'low' | 'med' | 'high'

/** One graded question joined with what we know about how it was written. */
export interface EvidenceItem {
  skillId: string
  mathLevel: number
  readingBand: ReadingBand
  pairId: string | null
  pairRole: 'low_reading' | 'target_reading' | null
  isStretch: boolean
  isReadingProbe: boolean
  /** The final judgement: the parent's if they confirmed, otherwise the system's. */
  status: ItemStatus
  errorType: ErrorType | null
  methodSound: boolean | null
  /** The parent confirmed it, or it was never flagged. Unconfirmed flagged answers must not count. */
  confirmed: boolean
  /** The parent said the answer key was wrong for this question. */
  keyFlaggedWrong: boolean
}

export interface SkillState {
  skillId: string
  mathLevel: number
  status: MasteryStatus
  evidenceCount: number
  secureCycles: number
  notYetCycles: number
  lastSeenCycle: number | null
  /** Scores of the last few cycles: not_yet = 0, developing = 1, secure = 2. */
  scoreHistory: number[]
  trend: Trend
  manualOverride: boolean
  retest: boolean
}

export interface ReadingState {
  band: ReadingBand
  estimated: boolean
  confidence: ReadingConfidence
  upStreak: number
  downStreak: number
  evidenceCycles: number
}

export interface EngineInput {
  cycleNumber: number
  readAloud: boolean
  /** False when the sheet could not be matched, so answers cannot be tied to skills. */
  attributeSkills: boolean
  items: EvidenceItem[]
  mastery: SkillState[]
  reading: ReadingState
  /** Skills whose level the parent set by hand since the last cycle. */
  parentOverrides: string[]
  /** Cycles since the reading band last changed, or null if it never has. */
  readingCyclesSinceChange: number | null
  /** Cycles already completed before this one. */
  completedCycles: number
  skillNames: Record<string, string>
  prerequisites: Record<string, string[]>
}

export interface CalibrationEvent {
  axis: 'math' | 'reading'
  skillId: string | null
  fromLevel: string
  toLevel: string
  reason: string
  source: 'rules'
}

export interface SkillResult {
  skillId: string
  skillName: string
  label: MasteryStatus
  /** Plain-language evidence, for example "2 of 2 right with a clear method". */
  evidence: string
  trend: Trend
  levelChange: { from: number; to: number } | null
  /** Notes about questions that do not move levels (a stretch question, a limit reached). */
  note: string | null
}

export type ReadingVerdict = 'reading_looks_fine' | 'reading_may_be_limiting' | 'not_enough_evidence'

export interface ReadingReadout {
  verdict: ReadingVerdict
  text: string
  pairsReadingLimited: number
  pairsReadingFine: number
  band: { from: ReadingBand; to: ReadingBand }
}

export interface EngineOutput {
  mastery: SkillState[]
  reading: ReadingState
  events: CalibrationEvent[]
  skillResults: SkillResult[]
  readingReadout: ReadingReadout
  /** Prerequisite skills to re-test after a level was lowered. */
  retestSkillIds: string[]
  flags: string[]
}
