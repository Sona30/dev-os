import { describe, expect, it } from 'vitest'
import { evaluateArithmetic } from '@/lib/worksheets/arithmetic'

// The app's own re-check of the model's answer. It must never execute anything the model writes.

describe('evaluateArithmetic', () => {
  it.each([
    ['4 + 3', 7],
    ['2+3*4', 14],
    ['(2+3)*4', 20],
    ['5-2-1', 2],
    ['10/4', 2.5],
    ['7×8', 56],
    ['12÷4', 3],
    ['-3+5', 2],
    ['1/3', 0.333333333],
  ])('evaluates %s', (expression, expected) => {
    expect(evaluateArithmetic(expression)).toBe(expected)
  })

  it.each(['', '   ', '2 +', '2)', '(2+3', '1/0', 'abc', '2**3', '1+1; process.exit()', 'Math.max(1,2)'])(
    'rejects %j',
    (expression) => {
      expect(evaluateArithmetic(expression)).toBeNull()
    },
  )

  it('rejects expressions over 100 characters', () => {
    expect(evaluateArithmetic(`${'1+'.repeat(60)}1`)).toBeNull()
  })
})
