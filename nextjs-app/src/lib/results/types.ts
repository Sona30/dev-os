import type { ErrorType, ItemStatus } from '@/lib/grading/types'
import type { MasteryStatus, ReadingBand } from '@/lib/schemas/common'

// Wire shapes for the results page and the progress dashboard (docs/specs/11 §3). Shared by server and browser.

export type Trend = 'improving' | 'steady' | 'slipping' | null

export interface ResultItemDto {
  position: number
  skillId: string
  skillName: string
  mathLevel: number
  readingBand: ReadingBand
  result: ItemStatus
  errorType: ErrorType | null
  extractionConfidence: number
  /** False when the answer was left out of the child's levels, with the reason. */
  counted: boolean
  notCountedReason?: 'unconfirmed' | 'key_flagged' | 'no_attribution'
}

export interface MasteryResultDto {
  skillId: string
  skillName: string
  label: MasteryStatus
  evidence: string
  trend: Trend
  levelChange: { from: number; to: number } | null
  note: string | null
}

export interface ReadingReadoutDto {
  verdict: 'reading_looks_fine' | 'reading_may_be_limiting' | 'not_enough_evidence'
  text: string
  band: { from: ReadingBand; to: ReadingBand }
}

export interface CalibrationEventDto {
  axis: 'math' | 'reading'
  skillName: string | null
  from: string
  to: string
  reason: string
}

export interface ResultsDto {
  cycle: { id: string; number: number; worksheetId: string | null; sheetId: string | null; completedAt: string | null }
  summary: string
  items: ResultItemDto[]
  mastery: MasteryResultDto[]
  readingReadout: ReadingReadoutDto
  recommendations: string[]
  activities: string[]
  calibration: { text: string; events: CalibrationEventDto[] }
  /** For example "suggest_teacher_share". */
  flags: string[]
  /** FR-19. Added by the server so no client path can leave it out. */
  disclosure: string
  feedback: { rating: number; comment: string | null } | null
}

export interface CycleListItemDto {
  id: string
  number: number
  status: string
  sheetId: string | null
  date: string | null
  headline: string
}

export interface DomainPointDto {
  cycle: number
  date: string | null
  /** Average of the skills practised that cycle: 0 = Not yet, 1 = Developing, 2 = Secure. */
  score: number
  skillsCovered: number
}

export interface DomainTrendDto {
  domain: string
  points: DomainPointDto[]
  latestTrend: Trend
}

export interface SkillProgressDto {
  skillId: string
  name: string
  domain: string
  currentLevel: number
  status: MasteryStatus
  trend: Trend
  history: Array<{ cycle: number; label: MasteryStatus; level: number }>
}

export interface ChangeDto {
  date: string
  cycle: number | null
  axis: 'math' | 'reading'
  text: string
}

export interface ProgressDto {
  baseline: {
    window: 'BOY' | 'MOY' | 'EOY' | null
    overallScore: number | null
    placement: string | null
    date: string | null
  } | null
  domains: DomainTrendDto[]
  skills: SkillProgressDto[]
  changes: ChangeDto[]
  reading: {
    band: ReadingBand | null
    estimated: boolean
    confidence: 'low' | 'med' | 'high'
    history: Array<{ cycle: number; band: string }>
  }
  completedCycles: number
}
