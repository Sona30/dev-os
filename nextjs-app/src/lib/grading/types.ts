// Shared by server and browser (docs/specs/09 §3).
export type ItemStatus = 'correct' | 'partial' | 'incorrect' | 'blank'
export type ErrorType = 'calculation_slip' | 'concept_gap' | 'reading_difficulty' | 'attention_copying' | 'unclear'

export interface ReviewItemDto {
  gradedItemId: string
  position: number
  questionText: string
  /** Signed link to the cropped handwriting, or null if a crop could not be made. */
  cropUrl: string | null
  extractedAnswer: string | null
  alternatives: string[]
  confidence: number
}

export interface ReviewQueueDto {
  /** All answers flagged for review on this sheet. */
  total: number
  /** Flagged answers the parent has not confirmed yet. */
  remaining: number
  items: ReviewItemDto[]
}

export interface GradingSummary {
  total: number
  gotIt: number
  stillBuilding: number
  blank: number
  /** Flagged answers still waiting for the parent. */
  needsCheck: number
}

export interface GradingStateDto {
  cycle: {
    id: string
    number: number
    status: string
    readAloud: boolean
    /** True when the sheet could not be matched, so answers were scored but not tied to skills. */
    noAttribution: boolean
    gradeJobId: string | null
    /** The job updating the levels once review is finished (status graded). */
    recalibrateJobId: string | null
    /** Written once the cycle is complete. */
    summaryText: string | null
    calibrationText: string | null
  } | null
  worksheet: { id: string; sheetId: string; itemCount: number } | null
  summary: GradingSummary | null
}
