import { describe, expect, it } from 'vitest'
import thresholds from '../../eval/thresholds.json'
import { evaluateGate, type Thresholds } from '../../eval/lib/gate'
import type { EvalReport, MetricResult } from '../../eval/lib/report'

// docs/specs/15 acceptance 3: the gate passes a good report and fails a deliberately degraded one.

const metric = (key: string, value: number | null): MetricResult => ({
  key,
  suite: 'T',
  label: key,
  value,
  n: 10,
  status: value === null ? 'skipped' : 'measured',
  failures: [],
})

const good = (mode: 'live' | 'mock' = 'live'): EvalReport => ({
  generatedAt: '2026-01-01T00:00:00Z',
  gitSha: 'abc',
  mode,
  models: ['m'],
  promptVersion: 'p',
  kbVersion: 'k',
  suitesRun: [],
  calls: [],
  details: {},
  metrics: Object.entries(thresholds.launch).map(([key, limit]) => {
    const rule = limit as { min?: number; max?: number }
    return metric(key, rule.min !== undefined ? Math.min(1, rule.min + 0.001) : (rule.max ?? 0))
  }),
})

describe('evaluateGate', () => {
  const t = thresholds as Thresholds

  it('passes a report that meets every launch threshold', () => {
    const result = evaluateGate(good(), t, 'launch')
    expect(result.problems).toEqual([])
    expect(result.passed).toBe(true)
  })

  it('fails a degraded report and names the metric', () => {
    const report = good()
    report.metrics = report.metrics.map((entry) => (entry.key === 'e7_exact' ? { ...entry, value: 0.7 } : entry))
    const result = evaluateGate(report, t, 'launch')
    expect(result.passed).toBe(false)
    expect(result.problems.join(' ')).toMatch(/e7_exact/)
  })

  it('fails when a "max" metric is exceeded', () => {
    const report = good()
    report.metrics = report.metrics.map((entry) => (entry.key === 'e6_repeats' ? { ...entry, value: 1 } : entry))
    expect(evaluateGate(report, t, 'launch').passed).toBe(false)
  })

  it('fails a metric that was not measured at beta and launch, but only warns at alpha', () => {
    const report = good()
    report.metrics = report.metrics.map((entry) => (entry.key === 'e7_exact' ? metric('e7_exact', null) : entry))
    expect(evaluateGate(report, t, 'launch').passed).toBe(false)
    expect(evaluateGate(report, t, 'alpha').passed).toBe(true)
    expect(evaluateGate(report, t, 'alpha').lines.find((line) => line.key === 'e7_exact')?.status).toBe('missing')
  })

  it('never lets a mock run pass beta or launch', () => {
    expect(evaluateGate(good('mock'), t, 'beta').passed).toBe(false)
    expect(evaluateGate(good('mock'), t, 'launch').passed).toBe(false)
  })

  it('keeps the thresholds in line with the spec table', () => {
    expect(t.launch.e3_key_correct).toEqual({ min: 1 })
    expect(t.launch.e7_exact).toEqual({ min: 0.92 })
    expect(t.beta.e7_exact).toEqual({ min: 0.88 })
    expect(t.launch.e13_cost_per_cycle).toEqual({ max: 0.25 })
    expect(t.beta.e13_cost_per_cycle).toEqual({ max: 0.35 })
    expect(t.launch.e14_segment_gap).toEqual({ max: 0.08 })
  })
})
