import { describe, expect, it } from 'vitest'
import { assertAxisRule, buildPlan, PlannerError, SHEET_SIZE } from '@/lib/worksheets/planner'
import type { PlannerInput } from '@/lib/worksheets/planner'
import type { PlannerSkill } from '@/lib/worksheets/types'

// The plan is decided in code before any model call (docs/specs/08 §4.1). These tests pin the rules the PRD
// promises: ten items, two diagnostic pairs, and no item raising both axes at once.

const skill = (skillId: string, domain: string, overrides: Partial<PlannerSkill> = {}): PlannerSkill => ({
  skillId,
  domain,
  mathLevel: 2,
  status: 'developing',
  changedLastCycle: false,
  ...overrides,
})

const input = (overrides: Partial<PlannerInput> = {}): PlannerInput => ({
  gaps: [
    skill('G1.NO.02', 'Number & Operations'),
    skill('G1.AL.01', 'Algebraic Thinking'),
    skill('G1.MD.03', 'Measurement'),
  ],
  nearMastery: [
    skill('G1.NO.01', 'Number & Operations', { status: 'secure' }),
    skill('G1.GE.01', 'Geometry', { status: 'secure' }),
    skill('G1.MD.01', 'Measurement', { status: 'developing' }),
  ],
  retest: [],
  readingBand: 'R2',
  readingUpStreak: 0,
  bias: 0,
  cycleNumber: 2,
  ...overrides,
})

describe('buildPlan', () => {
  it('always plans a full sheet with consecutive positions', () => {
    const plan = buildPlan(input())
    expect(plan.items).toHaveLength(SHEET_SIZE)
    expect(plan.items.map((item) => item.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('includes exactly two diagnostic pairs, each two items for one skill at one math level', () => {
    const plan = buildPlan(input())
    const pairs = new Map<string, typeof plan.items>()
    for (const item of plan.items) if (item.pairId) pairs.set(item.pairId, [...(pairs.get(item.pairId) ?? []), item])
    expect(pairs.size).toBe(2)
    for (const members of Array.from(pairs.values())) {
      expect(members).toHaveLength(2)
      expect(members[0]?.skillId).toBe(members[1]?.skillId)
      expect(members[0]?.mathLevel).toBe(members[1]?.mathLevel)
      expect(members.map((member) => member.pairRole).sort()).toEqual(['low_reading', 'target_reading'])
    }
  })

  it('puts the lower reading band on the low_reading half of a pair', () => {
    const plan = buildPlan(input({ readingBand: 'R3' }))
    const low = plan.items.find((item) => item.pairRole === 'low_reading')
    const target = plan.items.find((item) => item.pairRole === 'target_reading')
    expect(low?.readingBand).toBe('R2')
    expect(target?.readingBand).toBe('R3')
  })

  it('marks the low half minimal for an R1 reader, who has no lower band', () => {
    const plan = buildPlan(input({ readingBand: 'R1' }))
    const low = plan.items.find((item) => item.pairRole === 'low_reading')
    expect(low?.readingBand).toBe('R1')
    expect(low?.minimalReading).toBe(true)
  })

  it('opens with a near-mastery item for an early win', () => {
    expect(buildPlan(input()).items[0]?.role).toBe('near_mastery')
  })

  it('is deterministic', () => {
    expect(buildPlan(input())).toEqual(buildPlan(input()))
  })

  it('varies name hints between positions and cycles', () => {
    const a = buildPlan(input({ cycleNumber: 1 })).items.map((item) => item.nameHint)
    const b = buildPlan(input({ cycleNumber: 2 })).items.map((item) => item.nameHint)
    expect(new Set(a).size).toBeGreaterThan(5)
    expect(a).not.toEqual(b)
  })

  it('throws a PlannerError when there are no gaps', () => {
    expect(() => buildPlan(input({ gaps: [] }))).toThrow(PlannerError)
  })

  it('still fills the sheet when there is only one gap skill and no near-mastery skills', () => {
    const plan = buildPlan(input({ gaps: [skill('G1.NO.02', 'Number & Operations')], nearMastery: [] }))
    expect(plan.items).toHaveLength(SHEET_SIZE)
  })
})

describe('reading probe and stretch (axis independence, FR-06)', () => {
  it('adds one reading probe that raises reading only', () => {
    const plan = buildPlan(input())
    const probes = plan.items.filter((item) => item.role === 'reading_probe')
    expect(probes).toHaveLength(1)
    expect(probes[0]?.readingBand).toBe('R3')
    expect(probes[0]?.mathLevel).toBe(2)
  })

  it('adds a stretch item that raises math only', () => {
    const plan = buildPlan(input({ bias: 1 }))
    const stretch = plan.items.find((item) => item.role === 'stretch')
    expect(stretch?.mathLevel).toBe(3)
    expect(stretch?.readingBand).toBe('R2')
  })

  it('never raises both axes on one item', () => {
    for (const bias of [-1, 0, 1] as const) {
      for (const readingBand of ['R1', 'R2', 'R3', 'R4'] as const) {
        const plan = buildPlan(input({ bias, readingBand }))
        expect(() => assertAxisRule(plan, { readingBand })).not.toThrow()
      }
    }
  })

  it('adds no stretch or probe when the child found the last sheet too hard', () => {
    const plan = buildPlan(input({ bias: -1 }))
    expect(plan.items.some((item) => item.role === 'stretch' || item.role === 'reading_probe')).toBe(false)
  })

  it('adds no probe at the top band, or after two cycles of probe success', () => {
    expect(buildPlan(input({ readingBand: 'R4' })).items.some((item) => item.role === 'reading_probe')).toBe(false)
    expect(buildPlan(input({ readingUpStreak: 2 })).items.some((item) => item.role === 'reading_probe')).toBe(false)
  })

  it('leaves out skills whose level changed last cycle', () => {
    const plan = buildPlan(
      input({
        nearMastery: [skill('G1.NO.01', 'Number & Operations', { status: 'secure', changedLastCycle: true })],
        bias: 1,
      }),
    )
    expect(plan.items.some((item) => item.role === 'stretch' || item.role === 'reading_probe')).toBe(false)
  })

  it('re-tests flagged skills', () => {
    const plan = buildPlan(input({ retest: [skill('G1.NO.05', 'Number & Operations')] }))
    expect(plan.items.some((item) => item.role === 'review' && item.skillId === 'G1.NO.05')).toBe(true)
  })
})

describe('assertAxisRule', () => {
  it('rejects a pair made of two different skills', () => {
    const plan = buildPlan(input())
    const broken = {
      ...plan,
      items: plan.items.map((item) => (item.pairId === 'P1' && item.pairRole === 'low_reading' ? { ...item, skillId: 'X' } : item)),
    }
    expect(() => assertAxisRule(broken, { readingBand: 'R2' })).toThrow(PlannerError)
  })
})
