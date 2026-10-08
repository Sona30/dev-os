import type { ErrorType, ItemStatus } from './types'

// Confidence routing and error typing (FR-10, FR-11; docs/specs/09 §4.1-4.2). Pure functions.

/**
 * An answer goes to the parent when we are not sure what the child wrote, or when the model and the code
 * disagree about whether it is right. Nothing flagged ever reaches the child's results unconfirmed.
 */
export function needsParentReview(args: {
  confidence: number
  threshold: number
  modelStatus: ItemStatus
  finalStatus: ItemStatus
}): boolean {
  if (args.confidence < args.threshold) return true
  // "partial" is a judgement the code refines, so only a clear right/wrong/blank mismatch counts as disagreement.
  const comparable = (status: ItemStatus) => (status === 'partial' ? 'incorrect' : status)
  return comparable(args.modelStatus) !== comparable(args.finalStatus)
}

/**
 * Settles the final status. Code decides right, wrong or blank; "partial" is kept only for the two cases
 * the spec allows: the right number without its unit, or a clear calculation slip with sound method.
 */
export function settleStatus(args: {
  comparison: 'correct' | 'incorrect' | 'blank'
  unitMissing: boolean
  modelStatus: ItemStatus
  modelErrorType: ErrorType | null
  methodSound: boolean | null
}): ItemStatus {
  if (args.comparison === 'correct') return args.unitMissing ? 'partial' : 'correct'
  if (args.comparison === 'blank') return 'blank'
  if (args.modelStatus === 'partial' && args.modelErrorType === 'calculation_slip' && args.methodSound === true) {
    return 'partial'
  }
  return 'incorrect'
}

export interface PairContext {
  role: 'low_reading' | 'target_reading'
  partnerStatus: ItemStatus | null
}

/**
 * Chooses the error type. The reading-vs-maths read-out depends on the diagnostic pairs: if the easier-wording
 * question was right and the usual-wording one was wrong, that is evidence of a reading barrier; if both were
 * wrong, the maths is the bigger problem. "unclear" is always allowed and never forced into another label.
 */
export function refineErrorType(args: {
  finalStatus: ItemStatus
  modelErrorType: ErrorType | null
  methodSound: boolean | null
  pair: PairContext | null
}): ErrorType | null {
  const { finalStatus, pair } = args
  if (finalStatus === 'correct') return null

  const base: ErrorType = args.modelErrorType ?? (finalStatus === 'partial' ? 'calculation_slip' : 'unclear')

  if (pair?.partnerStatus) {
    const partnerRight = pair.partnerStatus === 'correct'
    const wrong = finalStatus === 'incorrect' || finalStatus === 'partial'
    if (pair.role === 'target_reading' && partnerRight && wrong) {
      // Strong method evidence of a concept problem outweighs the pair signal.
      return base === 'concept_gap' && args.methodSound === false ? 'concept_gap' : 'reading_difficulty'
    }
    const partnerWrong = pair.partnerStatus === 'incorrect' || pair.partnerStatus === 'partial'
    if (partnerWrong && wrong && base === 'reading_difficulty') return 'concept_gap'
  }
  return base
}
