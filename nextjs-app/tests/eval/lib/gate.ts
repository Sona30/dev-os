import type { EvalReport } from './report'

// Compares an evaluation report with the thresholds for a launch stage (docs/specs/15 §4, acceptance 3).

export type Stage = 'alpha' | 'beta' | 'launch'
export type Thresholds = Record<Stage, Record<string, { min?: number; max?: number }>>

export interface GateLine {
  key: string
  status: 'pass' | 'fail' | 'missing'
  value: number | null
  rule: string
}

export interface GateResult {
  stage: Stage
  passed: boolean
  lines: GateLine[]
  problems: string[]
}

const rule = (limit: { min?: number; max?: number }) =>
  limit.min !== undefined ? `>= ${limit.min}` : `<= ${limit.max ?? '?'}`

export function evaluateGate(report: EvalReport, thresholds: Thresholds, stage: Stage): GateResult {
  const problems: string[] = []
  // A fixture-only run proves the plumbing works, not that the product is good enough to release.
  if (report.mode === 'mock' && stage !== 'alpha') {
    problems.push('This report was produced with FOUNDRY_MOCK=true. Only live runs can pass the beta or launch gate.')
  }

  const lines: GateLine[] = []
  for (const [key, limit] of Object.entries(thresholds[stage])) {
    const metric = report.metrics.find((candidate) => candidate.key === key)
    const value = metric && metric.status === 'measured' ? metric.value : null
    if (value === null) {
      lines.push({ key, status: 'missing', value: null, rule: rule(limit) })
      // At alpha a metric with no data yet is a warning; later stages need every number.
      if (stage !== 'alpha') problems.push(`${key} was not measured.`)
      continue
    }
    const ok = (limit.min === undefined || value >= limit.min) && (limit.max === undefined || value <= limit.max)
    lines.push({ key, status: ok ? 'pass' : 'fail', value, rule: rule(limit) })
    if (!ok) problems.push(`${key} = ${value} (needs ${rule(limit)}).`)
  }
  return { stage, passed: problems.length === 0, lines, problems }
}
