import { describe, expect, it } from 'vitest'
import { needsParentReview, refineErrorType, settleStatus } from '@/lib/grading/routing'

describe('needsParentReview', () => {
  const base = { threshold: 0.85, modelStatus: 'correct', finalStatus: 'correct' } as const
  it('flags low confidence', () => {
    expect(needsParentReview({ ...base, confidence: 0.5 })).toBe(true)
  })
  it('flags confidence just under the threshold but not at it', () => {
    expect(needsParentReview({ ...base, confidence: 0.849 })).toBe(true)
    expect(needsParentReview({ ...base, confidence: 0.85 })).toBe(false)
  })
  it('flags when the model and the code disagree', () => {
    expect(needsParentReview({ ...base, confidence: 0.95, modelStatus: 'correct', finalStatus: 'incorrect' })).toBe(true)
  })
  it('treats partial and incorrect as the same judgement', () => {
    expect(needsParentReview({ ...base, confidence: 0.95, modelStatus: 'partial', finalStatus: 'incorrect' })).toBe(false)
  })
})

describe('settleStatus', () => {
  const base = { unitMissing: false, modelStatus: 'incorrect', modelErrorType: null, methodSound: null } as const
  it('correct stays correct, or partial when the unit is missing', () => {
    expect(settleStatus({ ...base, comparison: 'correct' })).toBe('correct')
    expect(settleStatus({ ...base, comparison: 'correct', unitMissing: true })).toBe('partial')
  })
  it('blank stays blank', () => {
    expect(settleStatus({ ...base, comparison: 'blank' })).toBe('blank')
  })
  it('keeps partial only for a calculation slip with sound method', () => {
    const slip = { ...base, comparison: 'incorrect', modelStatus: 'partial', modelErrorType: 'calculation_slip' } as const
    expect(settleStatus({ ...slip, methodSound: true })).toBe('partial')
    expect(settleStatus({ ...slip, methodSound: false })).toBe('incorrect')
    expect(settleStatus({ ...slip, methodSound: null })).toBe('incorrect')
  })
  it('never lets the model upgrade a wrong answer to correct', () => {
    expect(settleStatus({ ...base, comparison: 'incorrect', modelStatus: 'correct' })).toBe('incorrect')
  })
})

describe('refineErrorType', () => {
  it('has no error type for a correct answer', () => {
    expect(refineErrorType({ finalStatus: 'correct', modelErrorType: 'concept_gap', methodSound: null, pair: null })).toBeNull()
  })
  it('falls back to unclear, or calculation_slip for a partial', () => {
    expect(refineErrorType({ finalStatus: 'incorrect', modelErrorType: null, methodSound: null, pair: null })).toBe('unclear')
    expect(refineErrorType({ finalStatus: 'partial', modelErrorType: null, methodSound: null, pair: null })).toBe('calculation_slip')
  })
  it('reads a right easy-wording answer plus a wrong usual-wording answer as a reading barrier', () => {
    expect(
      refineErrorType({
        finalStatus: 'incorrect',
        modelErrorType: 'calculation_slip',
        methodSound: null,
        pair: { role: 'target_reading', partnerStatus: 'correct' },
      }),
    ).toBe('reading_difficulty')
  })
  it('lets clear method evidence of a concept gap outweigh the pair signal', () => {
    expect(
      refineErrorType({
        finalStatus: 'incorrect',
        modelErrorType: 'concept_gap',
        methodSound: false,
        pair: { role: 'target_reading', partnerStatus: 'correct' },
      }),
    ).toBe('concept_gap')
  })
  it('reads both halves wrong as a maths problem rather than reading', () => {
    expect(
      refineErrorType({
        finalStatus: 'incorrect',
        modelErrorType: 'reading_difficulty',
        methodSound: null,
        pair: { role: 'target_reading', partnerStatus: 'incorrect' },
      }),
    ).toBe('concept_gap')
  })
  it('does not blame reading when the easy-wording half is the one that was wrong', () => {
    expect(
      refineErrorType({
        finalStatus: 'incorrect',
        modelErrorType: 'calculation_slip',
        methodSound: null,
        pair: { role: 'low_reading', partnerStatus: 'correct' },
      }),
    ).toBe('calculation_slip')
  })
})
