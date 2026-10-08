import { describe, expect, it } from 'vitest'
import { compareAnswer, confusionAlternatives, isBlank, numberFrom, wordsToDigits } from '@/lib/grading/compare'
import type { KeyAnswer } from '@/lib/grading/compare'

// The code, not the model, decides whether an answer is right (docs/specs/09 §4.4).

const integerKey = (correctAnswer: string): KeyAnswer => ({ answerType: 'integer', correctAnswer, acceptedAnswers: [] })

describe('wordsToDigits', () => {
  it('converts number words', () => {
    expect(wordsToDigits('twelve')).toBe('12')
    expect(wordsToDigits('twenty-one')).toBe('21')
    expect(wordsToDigits('seventy')).toBe('70')
    expect(wordsToDigits('one hundred')).toBe('100')
  })
  it('leaves other words alone', () => {
    expect(wordsToDigits('ten apples')).toBe('10 apples')
  })
})

describe('isBlank', () => {
  it.each([null, undefined, '', '   ', '-', '—', '...'])('treats %j as blank', (value) => {
    expect(isBlank(value)).toBe(true)
  })
  it('does not treat a written answer as blank', () => {
    expect(isBlank('0')).toBe(false)
  })
})

describe('numberFrom', () => {
  it('takes the number after an equals sign', () => {
    expect(numberFrom('5 + 7 = 12')).toBe(12)
  })
  it('takes the last number otherwise', () => {
    expect(numberFrom('about 12')).toBe(12)
  })
  it('returns null when there is no number', () => {
    expect(numberFrom('none')).toBeNull()
  })
})

describe('compareAnswer: integer', () => {
  it('accepts digits, working and number words', () => {
    expect(compareAnswer('12', integerKey('12')).status).toBe('correct')
    expect(compareAnswer('5 + 7 = 12', integerKey('12')).status).toBe('correct')
    expect(compareAnswer('twelve', integerKey('12')).status).toBe('correct')
  })
  it('marks a different number incorrect', () => {
    expect(compareAnswer('13', integerKey('12')).status).toBe('incorrect')
  })
  it('marks nothing written as blank, never incorrect', () => {
    expect(compareAnswer('', integerKey('12')).status).toBe('blank')
    expect(compareAnswer(null, integerKey('12')).status).toBe('blank')
  })
  it('does not treat a zero answer as blank', () => {
    expect(compareAnswer('0', integerKey('0')).status).toBe('correct')
  })
})

describe('compareAnswer: text', () => {
  const key: KeyAnswer = { answerType: 'text', correctAnswer: '7 apples', acceptedAnswers: [] }
  it('accepts the exact answer', () => {
    expect(compareAnswer('7 apples', key)).toEqual({ status: 'correct', unitMissing: false })
  })
  it('accepts the right number without its unit, and says the unit is missing', () => {
    expect(compareAnswer('7', key)).toEqual({ status: 'correct', unitMissing: true })
  })
  it('rejects a wrong number', () => {
    expect(compareAnswer('8', key).status).toBe('incorrect')
  })
  it('ignores case, punctuation and articles', () => {
    const named: KeyAnswer = { answerType: 'text', correctAnswer: 'the red ball', acceptedAnswers: [] }
    expect(compareAnswer('Red Ball.', named).status).toBe('correct')
  })
  it('accepts listed alternative answers', () => {
    const alt: KeyAnswer = { answerType: 'text', correctAnswer: 'twelve', acceptedAnswers: ['a dozen'] }
    expect(compareAnswer('a dozen', alt).status).toBe('correct')
  })
})

describe('compareAnswer: choice', () => {
  const key: KeyAnswer = { answerType: 'choice', correctAnswer: 'B', acceptedAnswers: [] }
  it('matches the letter however it is written', () => {
    expect(compareAnswer('b', key).status).toBe('correct')
    expect(compareAnswer('(B)', key).status).toBe('correct')
  })
  it('rejects a different letter', () => {
    expect(compareAnswer('C', key).status).toBe('incorrect')
  })
})

describe('confusionAlternatives', () => {
  it('suggests look-alike digits, at most two', () => {
    expect(confusionAlternatives('6')).toEqual(['5', '9'])
    expect(confusionAlternatives('16')).toEqual(['15', '19'])
  })
  it('works from the last digit backwards', () => {
    expect(confusionAlternatives('12')).toEqual(['72'])
  })
  it('returns nothing for non-numeric or missing input', () => {
    expect(confusionAlternatives('abc')).toEqual([])
    expect(confusionAlternatives(null)).toEqual([])
    expect(confusionAlternatives('1234')).toEqual([])
  })
  it('never offers the original value', () => {
    for (const value of ['0', '1', '3', '5', '6', '7', '8', '9', '16', '89']) {
      expect(confusionAlternatives(value)).not.toContain(value)
    }
  })
})
