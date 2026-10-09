import { describe, expect, it } from 'vitest'
import { checkItem, emptyUsedKeys, markUsed } from '@/lib/worksheets/checks'
import type { GeneratedItem } from '@/lib/worksheets/checks'
import type { PlanItem } from '@/lib/worksheets/types'

// Every generated item must pass these checks before a parent can see it (FR-07, FR-08, FR-05).

const plan: PlanItem = {
  position: 1,
  skillId: 'G1.NO.02',
  domain: 'Number & Operations',
  mathLevel: 2,
  readingBand: 'R1',
  role: 'gap',
  pairId: 'P1',
  pairRole: 'low_reading',
  minimalReading: false,
  nameHint: 'Mia',
}

const good: GeneratedItem = {
  position: 1,
  skillId: 'G1.NO.02',
  domain: 'Number & Operations',
  mathLevel: 2,
  readingBand: 'R1',
  pairId: 'P1',
  isStretch: false,
  isReadingProbe: false,
  structure: 'join',
  context: 'park',
  numberSet: [4, 3],
  questionText: 'Mia has 4 ducks and gets 3 more. How many now?',
  answerType: 'integer',
  correctAnswer: '7',
  acceptedAnswers: ['seven'],
  working: '4 + 3 = 7',
  verification: { expression: '4 + 3', expected: '7', passed: true, method: 'code_interpreter' },
  ambiguous: false,
}

const withChanges = (changes: Partial<GeneratedItem>): GeneratedItem => ({ ...good, ...changes })
const reasonsFor = (item: GeneratedItem, used = emptyUsedKeys()) => checkItem(item, plan, used)

describe('checkItem', () => {
  it('accepts a good item', () => {
    expect(reasonsFor(good)).toEqual([])
  })

  it('rejects an item that changes what the planner decided', () => {
    expect(reasonsFor(withChanges({ skillId: 'G1.NO.09' })).join(' ')).toMatch(/plan requires/)
    expect(reasonsFor(withChanges({ mathLevel: 3 })).join(' ')).toMatch(/math level/)
    expect(reasonsFor(withChanges({ readingBand: 'R2' })).join(' ')).toMatch(/reading band/)
    expect(reasonsFor(withChanges({ pairId: null })).join(' ')).toMatch(/pair id/)
    expect(reasonsFor(withChanges({ isStretch: true })).join(' ')).toMatch(/stretch flag/)
  })

  it('rejects an answer that failed or skipped verification', () => {
    const failed = withChanges({ verification: { ...good.verification, passed: false } })
    expect(reasonsFor(failed).join(' ')).toMatch(/verification/)
    const reasoned = withChanges({ verification: { ...good.verification, method: 'reasoned' } })
    expect(reasonsFor(reasoned).join(' ')).toMatch(/Code Interpreter/)
  })

  it('recomputes the answer itself and rejects a wrong key even when the model says it passed', () => {
    const wrongKey = withChanges({ correctAnswer: '8' })
    expect(reasonsFor(wrongKey).join(' ')).toMatch(/evaluates to 7, not 8/)
  })

  it('rejects an expression it cannot evaluate, or a missing one', () => {
    expect(reasonsFor(withChanges({ verification: { ...good.verification, expression: 'four plus three' } })).join(' ')).toMatch(
      /could not be evaluated/,
    )
    expect(reasonsFor(withChanges({ verification: { ...good.verification, expression: null } })).join(' ')).toMatch(
      /needs a verification expression/,
    )
  })

  it('rejects ambiguous items and items with no single question', () => {
    expect(reasonsFor(withChanges({ ambiguous: true })).join(' ')).toMatch(/ambiguous/)
    expect(reasonsFor(withChanges({ questionText: 'Mia has 4 ducks and gets 3 more.' })).join(' ')).toMatch(/exactly one question/)
    expect(reasonsFor(withChanges({ questionText: 'Mia has 4 ducks and gets 3 more? How many now?' })).join(' ')).toMatch(
      /exactly one question/,
    )
  })

  it('rejects vague words', () => {
    expect(reasonsFor(withChanges({ questionText: 'Mia has about 4 ducks and gets 3 more. How many now?' })).join(' ')).toMatch(
      /vague/,
    )
  })

  it('rejects a problem that gives the answer away', () => {
    const leaky = withChanges({ questionText: 'Mia has 4 ducks and gets 3 more, so 7 in all. How many?' })
    expect(reasonsFor(leaky).join(' ')).toMatch(/contains the answer/)
  })

  it('rejects numbers listed but missing from the problem', () => {
    expect(reasonsFor(withChanges({ numberSet: [4, 3, 9] })).join(' ')).toMatch(/number 9/)
  })

  it('accepts an item with no numbers when the answer is not a whole number', () => {
    const shapes = withChanges({
      skillId: 'G1.GEO.01',
      structure: 'identify',
      context: 'blocks',
      numberSet: [],
      questionText: 'Ben has a ball and a box. Which one is shaped like a cube?',
      answerType: 'text',
      correctAnswer: 'the box',
      acceptedAnswers: ['box'],
      working: 'A box can be a cube.',
      verification: { expression: null, expected: 'the box', passed: true, method: 'reasoned' },
    })
    const geometryPlan = { ...plan, skillId: 'G1.GEO.01' }
    expect(checkItem(shapes, geometryPlan, emptyUsedKeys())).toEqual([])
  })

  it('still requires listed numbers for a whole-number answer', () => {
    expect(reasonsFor(withChanges({ numberSet: [] })).join(' ')).toMatch(/List the numbers/)
  })

  it('tells the model to use an empty list when the problem has no numbers', () => {
    expect(reasonsFor(withChanges({ numberSet: [0] })).join(' ')).toMatch(/use \[\]/)
  })

  it('does not treat two number-free items as the same numbers', () => {
    const used = emptyUsedKeys()
    markUsed(used, withChanges({ numberSet: [] }), false)
    expect(used.numberSets.size).toBe(0)
    const other = withChanges({ numberSet: [], answerType: 'text', correctAnswer: 'yes', acceptedAnswers: [] })
    expect(checkItem(other, plan, used).join(' ')).not.toMatch(/numbers were used before/)
  })

  it('rejects unsuitable scenarios', () => {
    expect(reasonsFor(withChanges({ context: 'a scary ghost' })).join(' ')).toMatch(/not suitable/)
  })

  it('rejects text that is too hard for the reading band', () => {
    const hard = withChanges({
      questionText: 'Mia has 4 ducks and she gets 3 more ducks from the pond. How many ducks now?',
    })
    expect(reasonsFor(hard).length).toBeGreaterThan(0)
  })

  it('rejects anything used in the last four cycles', () => {
    const used = emptyUsedKeys()
    markUsed(used, good, true)
    const reasons = reasonsFor(good, used).join(' ')
    expect(reasons).toMatch(/question was used before/)
    expect(reasons).toMatch(/numbers were used before/)
    expect(reasons).toMatch(/scenario and structure/)
  })

  it('treats a renamed copy of a used question as a repeat', () => {
    const used = emptyUsedKeys()
    markUsed(used, good, true)
    const renamed = withChanges({ questionText: 'Omar has 4 ducks and gets 3 more. How many now?' })
    expect(reasonsFor(renamed, used).join(' ')).toMatch(/question was used before/)
  })
})

describe('markUsed', () => {
  it('can skip the scenario key so both halves of a pair may share a scenario', () => {
    const used = emptyUsedKeys()
    markUsed(used, good, false)
    expect(used.hashes.size).toBe(1)
    expect(used.contextStructures.size).toBe(0)
  })
})
