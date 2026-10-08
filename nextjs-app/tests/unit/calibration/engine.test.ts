import { describe, expect, it } from 'vitest'
import { recalibrate, trendFrom } from '@/lib/calibration/engine'
import type { EngineInput, EvidenceItem, SkillState } from '@/lib/calibration/types'

// Rule-by-rule checks for the calibration engine (docs/specs/10). These pin down the PRD's promises:
// one item is never enough, levels move one step at a time, only trusted answers count, and the reading
// level only moves on reading evidence.

const skill = (overrides: Partial<SkillState> = {}): SkillState => ({
  skillId: 'G1.NO.02',
  mathLevel: 2,
  status: 'not_enough_evidence',
  evidenceCount: 0,
  secureCycles: 0,
  notYetCycles: 0,
  lastSeenCycle: null,
  scoreHistory: [],
  trend: null,
  manualOverride: false,
  retest: false,
  ...overrides,
})

const item = (overrides: Partial<EvidenceItem> = {}): EvidenceItem => ({
  skillId: 'G1.NO.02',
  mathLevel: 2,
  readingBand: 'R2',
  pairId: null,
  pairRole: null,
  isStretch: false,
  isReadingProbe: false,
  status: 'correct',
  errorType: null,
  methodSound: true,
  confirmed: true,
  keyFlaggedWrong: false,
  ...overrides,
})

const input = (overrides: Partial<EngineInput> = {}): EngineInput => ({
  cycleNumber: 1,
  readAloud: false,
  attributeSkills: true,
  items: [],
  mastery: [skill()],
  reading: reading(),
  parentOverrides: [],
  readingCyclesSinceChange: null,
  completedCycles: 0,
  skillNames: { 'G1.NO.02': 'Add within 20', 'G1.NO.01': 'Count to 120' },
  prerequisites: { 'G1.NO.02': ['G1.NO.01'] },
  ...overrides,
})

const reading = (overrides = {}) => ({
  band: 'R2' as const,
  estimated: true,
  confidence: 'low' as const,
  upStreak: 0,
  downStreak: 0,
  evidenceCycles: 0,
  ...overrides,
})

const correct = (n: number) => Array.from({ length: n }, () => item())
const conceptWrong = (n: number) =>
  Array.from({ length: n }, () => item({ status: 'incorrect', errorType: 'concept_gap', methodSound: false }))

describe('mastery labels', () => {
  it('never labels a skill from a single item', () => {
    const out = recalibrate(input({ items: correct(1), reading: reading() }))
    expect(out.mastery[0]?.status).toBe('not_enough_evidence')
    expect(out.mastery[0]?.mathLevel).toBe(2)
    expect(out.events).toHaveLength(0)
  })

  it('is Secure with two correct answers and a sound method, and moves up one level', () => {
    const out = recalibrate(input({ items: correct(2), reading: reading() }))
    expect(out.mastery[0]?.status).toBe('secure')
    expect(out.mastery[0]?.mathLevel).toBe(3)
    expect(out.events.filter((event) => event.axis === 'math')).toHaveLength(1)
  })

  it('is Not yet only after two concept-gap misses, and does not drop on the first cycle', () => {
    const out = recalibrate(input({ items: conceptWrong(2), reading: reading() }))
    expect(out.mastery[0]?.status).toBe('not_yet')
    expect(out.mastery[0]?.mathLevel).toBe(2)
    expect(out.mastery[0]?.notYetCycles).toBe(1)
  })

  it('lowers a level after Not yet on two cycles and asks to re-test the prerequisite', () => {
    const out = recalibrate(
      input({ items: conceptWrong(2), mastery: [skill({ status: 'not_yet', notYetCycles: 1 })], reading: reading() }),
    )
    expect(out.mastery[0]?.mathLevel).toBe(1)
    expect(out.retestSkillIds).toEqual(['G1.NO.01'])
    expect(out.mastery[0]?.notYetCycles).toBe(0)
  })

  it('lowers a level at once for a clear concept gap: nothing right on three or more questions', () => {
    const out = recalibrate(input({ items: conceptWrong(3), reading: reading() }))
    expect(out.mastery[0]?.mathLevel).toBe(1)
  })

  it('is Developing for mixed results and holds the level', () => {
    const out = recalibrate(input({ items: [...correct(1), ...conceptWrong(1)], reading: reading() }))
    expect(out.mastery[0]?.status).toBe('developing')
    expect(out.mastery[0]?.mathLevel).toBe(2)
  })

  it('never moves more than one level in a cycle', () => {
    const out = recalibrate(input({ items: correct(6), reading: reading() }))
    expect(out.mastery[0]?.mathLevel).toBe(3)
  })

  it('stops at the highest and earliest levels', () => {
    const top = recalibrate(input({ items: correct(2).map((i) => ({ ...i, mathLevel: 4 })), mastery: [skill({ mathLevel: 4 })], reading: reading() }))
    expect(top.mastery[0]?.mathLevel).toBe(4)
    const bottom = recalibrate(input({ items: conceptWrong(3).map((i) => ({ ...i, mathLevel: 1 })), mastery: [skill({ mathLevel: 1 })], reading: reading() }))
    expect(bottom.mastery[0]?.mathLevel).toBe(1)
  })
})

describe('which answers count', () => {
  it('ignores unconfirmed answers and disputed keys', () => {
    const out = recalibrate(
      input({
        items: [item({ confirmed: false }), item({ confirmed: false }), item({ keyFlaggedWrong: true }), item()],
        reading: reading(),
      }),
    )
    expect(out.mastery[0]?.status).toBe('not_enough_evidence')
    expect(out.mastery[0]?.evidenceCount).toBe(1)
  })

  it('does not count blank answers as evidence', () => {
    const out = recalibrate(input({ items: [item({ status: 'blank' }), item({ status: 'blank' })], reading: reading() }))
    expect(out.mastery[0]?.evidenceCount).toBe(0)
  })

  it('does not let stretch questions or other levels move a skill', () => {
    const out = recalibrate(
      input({ items: [item({ mathLevel: 3, isStretch: true }), item({ mathLevel: 3, isStretch: true })], reading: reading() }),
    )
    expect(out.mastery[0]?.mathLevel).toBe(2)
    expect(out.skillResults[0]?.note).toMatch(/harder question/)
  })

  it('treats reading-difficulty and attention errors as not maths evidence', () => {
    const out = recalibrate(
      input({
        items: [
          item({ status: 'incorrect', errorType: 'reading_difficulty' }),
          item({ status: 'incorrect', errorType: 'attention_copying' }),
        ],
        reading: reading(),
      }),
    )
    expect(out.mastery[0]?.evidenceCount).toBe(0)
  })

  it('changes nothing when the sheet could not be matched to skills', () => {
    const start = input({ items: correct(3), reading: reading() })
    const out = recalibrate({ ...start, attributeSkills: false })
    expect(out.mastery).toEqual(start.mastery)
    expect(out.flags).toContain('no_attribution')
  })
})

describe('reading axis', () => {
  const pair = (lowStatus: 'correct' | 'incorrect', targetStatus: 'correct' | 'incorrect') => [
    item({ pairId: 'P1', pairRole: 'low_reading', status: lowStatus }),
    item({ pairId: 'P1', pairRole: 'target_reading', status: targetStatus, errorType: targetStatus === 'incorrect' ? 'reading_difficulty' : null }),
  ]

  it('never changes on maths-only mistakes', () => {
    const out = recalibrate(input({ items: pair('incorrect', 'incorrect'), reading: reading() }))
    expect(out.reading).toEqual(reading())
  })

  it('never changes when the parent read the questions aloud', () => {
    const out = recalibrate(input({ items: pair('correct', 'incorrect'), readAloud: true, reading: reading() }))
    expect(out.reading).toEqual(reading())
  })

  it('lowers the reading band only after the same trouble on two cycles', () => {
    const first = recalibrate(input({ items: pair('correct', 'incorrect'), reading: reading() }))
    expect(first.reading.band).toBe('R2')
    expect(first.reading.downStreak).toBe(1)
    expect(first.readingReadout.verdict).toBe('reading_may_be_limiting')

    const second = recalibrate(input({ items: pair('correct', 'incorrect'), reading: first.reading }))
    expect(second.reading.band).toBe('R1')
    expect(second.events.some((event) => event.axis === 'reading')).toBe(true)
  })

  it('raises the reading band after a successful reading probe on two cycles', () => {
    const probe = [item({ isReadingProbe: true, readingBand: 'R3' })]
    const first = recalibrate(input({ items: probe, reading: reading() }))
    expect(first.reading.upStreak).toBe(1)
    const second = recalibrate(input({ items: probe, reading: first.reading }))
    expect(second.reading.band).toBe('R3')
    expect(second.reading.confidence).toBe('med')
  })

  it('does not move past the first or last band', () => {
    const top = recalibrate(input({ items: [item({ isReadingProbe: true })], reading: reading({ band: 'R4', upStreak: 1 }) }))
    expect(top.reading.band).toBe('R4')
    const bottom = recalibrate(input({ items: pair('correct', 'incorrect'), reading: reading({ band: 'R1', downStreak: 1 }) }))
    expect(bottom.reading.band).toBe('R1')
  })
})

describe('trend, decay and parent override', () => {
  it('needs two sheets before reporting a trend', () => {
    expect(trendFrom([2])).toBeNull()
    expect(trendFrom([0, 1])).toBe('improving')
    expect(trendFrom([2, 1])).toBe('slipping')
    expect(trendFrom([1, 1, 1])).toBe('steady')
  })

  it('flags a skill not seen for three cycles for re-testing', () => {
    const out = recalibrate(input({ cycleNumber: 5, mastery: [skill({ lastSeenCycle: 2, status: 'developing' })], reading: reading() }))
    expect(out.mastery[0]?.retest).toBe(true)
    expect(out.flags).toContain('retest:G1.NO.02')
  })

  it('holds a level the parent just set by hand and clears the flag', () => {
    const out = recalibrate(
      input({ items: correct(2), mastery: [skill({ manualOverride: true })], parentOverrides: ['G1.NO.02'], reading: reading() }),
    )
    expect(out.mastery[0]?.mathLevel).toBe(2)
    expect(out.mastery[0]?.manualOverride).toBe(false)
  })
})

describe('rule compliance over many random sheets', () => {
  // A small seeded generator keeps the run reproducible.
  let seed = 7
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }

  it('never moves a level more than one step, and never touches reading on maths-only errors', () => {
    for (let round = 0; round < 2000; round++) {
      const level = 1 + Math.floor(random() * 4)
      const items: EvidenceItem[] = Array.from({ length: Math.floor(random() * 6) }, () => {
        const right = random() < 0.5
        return item({
          mathLevel: random() < 0.8 ? level : Math.min(4, level + 1),
          status: right ? 'correct' : 'incorrect',
          errorType: right ? null : random() < 0.5 ? 'concept_gap' : 'calculation_slip',
          methodSound: random() < 0.7,
          confirmed: random() < 0.9,
        })
      })
      const start = reading({ band: 'R2', upStreak: 1, downStreak: 1 })
      const out = recalibrate(
        input({
          items,
          mastery: [skill({ mathLevel: level, status: random() < 0.5 ? 'secure' : 'not_yet', secureCycles: 1, notYetCycles: 1 })],
          reading: start,
        }),
      )
      expect(Math.abs((out.mastery[0]?.mathLevel ?? level) - level)).toBeLessThanOrEqual(1)
      expect(out.reading).toEqual(start) // no pair, probe or reading-difficulty evidence in these sheets
    }
  })
})
