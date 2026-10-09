import { describe, expect, it } from 'vitest'
import { applyGuards, diagnoseConfidence, guardDiagnose } from '@/lib/foundry/guards'
import type { ModeInputs, ModeOutputs } from '@/lib/foundry/types'

type DiagnoseInput = ModeInputs['diagnose']
type DiagnoseOutput = ModeOutputs['diagnose']

const profile = {
  child: { nickname: 'Test', grade: 1 as const },
  baseline: { overallScore: 412, placement: null, window: null, reportDate: null },
  reading: { lexile: null, band: null, estimated: true, confidence: 'low' as const },
  skills: [],
  cycles: [],
  flags: [],
}

function input(score: Partial<DiagnoseInput['score_or_placement']>): DiagnoseInput {
  return {
    grade: 1,
    score_or_placement: { overall_score: 412, placement: null, window: null, domains: [], ...score },
    lexile: null,
    catalog: [],
    child_profile: profile,
  }
}

function gap(likely: boolean, skillId: string | null = 'G1.NO.01') {
  return {
    domain: 'Number & Operations',
    skillId,
    skillName: 'Count',
    evidence: 'e',
    gapLevel: 'moderate' as const,
    priority: 1,
    suggestedMathLevel: 2,
    likely,
  }
}

function output(dataConfidence: DiagnoseOutput['dataConfidence'], likely: boolean[]): DiagnoseOutput {
  return {
    dataConfidence,
    summary: 's',
    gaps: likely.map((value, index) => gap(value, `G1.NO.0${index + 1}`)),
    strengths: [],
    recommendations: [],
    unmapped: [],
    estimatedReadingBand: null,
    flags: [],
  }
}

const domains = [{ domain: 'Geometry', placement: 'Mid Grade 1', score: null }]

describe('diagnoseConfidence', () => {
  it('is high when domain-level results are present', () => {
    expect(diagnoseConfidence(input({ domains }))).toBe('high')
    expect(diagnoseConfidence(input({ domains: [{ domain: 'Geometry', placement: null, score: 410 }] }))).toBe('high')
  })
  it('is medium with only an overall placement', () => {
    expect(diagnoseConfidence(input({ placement: 'Early Grade 1' }))).toBe('medium')
  })
  it('is low with only a scale score', () => {
    expect(diagnoseConfidence(input({}))).toBe('low')
  })
  it('ignores domains that carry no result', () => {
    expect(diagnoseConfidence(input({ domains: [{ domain: 'Geometry', placement: null, score: null }] }))).toBe('low')
  })
})

describe('guardDiagnose', () => {
  it('raises a model "medium" to high when domain results exist, and leaves gaps as the model set them', () => {
    const result = guardDiagnose(input({ domains }), output('medium', [true, false]))
    expect(result.data.dataConfidence).toBe('high')
    expect(result.data.gaps.map((g) => g.likely)).toEqual([true, false])
    expect(result.corrections).toEqual(['dataConfidence medium -> high'])
  })
  it('lowers confidence to low for a score-only input and marks every gap likely', () => {
    const result = guardDiagnose(input({}), output('high', [false, true, false]))
    expect(result.data.dataConfidence).toBe('low')
    expect(result.data.gaps.every((g) => g.likely)).toBe(true)
    expect(result.corrections).toHaveLength(3)
  })
  it('changes nothing when the model already followed the rules', () => {
    const original = output('medium', [true, true])
    const result = guardDiagnose(input({ placement: 'Early Grade 1' }), original)
    expect(result.corrections).toEqual([])
    expect(result.data).toEqual(original)
  })
  it('does not mutate the model output', () => {
    const original = output('high', [false])
    guardDiagnose(input({}), original)
    expect(original.dataConfidence).toBe('high')
    expect(original.gaps[0]!.likely).toBe(false)
  })
})

describe('applyGuards', () => {
  it('passes other modes through untouched', () => {
    const explain = { text: 'hi' } as unknown as ModeOutputs['explain']
    const result = applyGuards('explain', {} as ModeInputs['explain'], explain)
    expect(result.data).toBe(explain)
    expect(result.corrections).toEqual([])
  })
})
