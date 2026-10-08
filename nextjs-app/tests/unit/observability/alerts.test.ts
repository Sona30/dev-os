import { describe, expect, it } from 'vitest'
import { evaluateAlerts, percentile, thresholdsFromEnv, type Metrics } from '@/lib/observability/alerts'

// The alert rules decide when a person is woken up, so each threshold and each "too few to judge" floor is pinned.

const quiet: Metrics = {
  cost7d: { cycles: 100, costPerCycleUsd: 0.15 },
  monthSpendUsd: 100,
  override7d: { confirmed: 200, rate: 0.04 },
  failures1h: [{ type: 'generate_worksheet', jobs: 40, failed: 1 }],
  latencyP95: {
    generate_worksheet: { jobs: 50, p95Seconds: 60 },
    grade_sheet: { jobs: 50, p95Seconds: 40 },
    parse_report: { jobs: 20, p95Seconds: 20 },
    diagnose: { jobs: 20, p95Seconds: 15 },
  },
  keyFlags24h: 0,
  timeouts1h: 0,
  staleQueued: 0,
}

const thresholds = { costPerCycleUsd: 0.35, monthlyBudgetUsd: 1000, overrideRate: 0.1 }
const keys = (metrics: Metrics) => evaluateAlerts(metrics, thresholds).map((alert) => alert.key)

describe('evaluateAlerts', () => {
  it('stays quiet when everything is healthy', () => {
    expect(keys(quiet)).toEqual([])
  })

  it('alerts when the cost per cycle passes the limit, but not on a tiny sample', () => {
    expect(keys({ ...quiet, cost7d: { cycles: 50, costPerCycleUsd: 0.5 } })).toContain('cost-per-cycle')
    expect(keys({ ...quiet, cost7d: { cycles: 2, costPerCycleUsd: 0.9 } })).not.toContain('cost-per-cycle')
  })

  it('warns at 80% of the monthly budget and escalates when it is used up', () => {
    expect(keys({ ...quiet, monthSpendUsd: 799 })).toEqual([])
    expect(keys({ ...quiet, monthSpendUsd: 800 })).toEqual(['monthly-budget-80'])
    expect(keys({ ...quiet, monthSpendUsd: 1000 })).toEqual(['monthly-budget-exceeded'])
  })

  it('ignores the budget rules when no budget is set', () => {
    const none = evaluateAlerts({ ...quiet, monthSpendUsd: 5000 }, { ...thresholds, monthlyBudgetUsd: 0 })
    expect(none).toEqual([])
  })

  it('alerts when parents correct more than 10% of graded answers, with enough answers to judge', () => {
    expect(keys({ ...quiet, override7d: { confirmed: 100, rate: 0.15 } })).toContain('override-rate')
    expect(keys({ ...quiet, override7d: { confirmed: 10, rate: 0.5 } })).not.toContain('override-rate')
  })

  it('alerts when over 20% of at least 10 jobs fail in an hour', () => {
    expect(keys({ ...quiet, failures1h: [{ type: 'grade_sheet', jobs: 20, failed: 5 }] })).toContain('job-failures')
    expect(keys({ ...quiet, failures1h: [{ type: 'grade_sheet', jobs: 5, failed: 5 }] })).not.toContain('job-failures')
  })

  it('alerts per job type when the 95th percentile passes the target', () => {
    const slow = {
      ...quiet,
      latencyP95: {
        ...quiet.latencyP95,
        generate_worksheet: { jobs: 50, p95Seconds: 95 },
        grade_sheet: { jobs: 50, p95Seconds: 61 },
      },
    }
    expect(keys(slow)).toEqual(['latency-generate_worksheet', 'latency-grade_sheet'])
    expect(keys({ ...quiet, latencyP95: { generate_worksheet: { jobs: 2, p95Seconds: 500 } } })).toEqual([])
  })

  it('treats a single reported wrong answer key as urgent', () => {
    const alert = evaluateAlerts({ ...quiet, keyFlags24h: 1 }, thresholds)[0]
    expect(alert?.key).toBe('wrong-answer-key')
    expect(alert?.severity).toBe('P1')
  })

  it('alerts on stuck jobs and a backed-up queue', () => {
    expect(keys({ ...quiet, timeouts1h: 5 })).toContain('stuck-jobs')
    expect(keys({ ...quiet, timeouts1h: 4 })).not.toContain('stuck-jobs')
    expect(keys({ ...quiet, staleQueued: 21 })).toContain('queue-depth')
    expect(keys({ ...quiet, staleQueued: 20 })).not.toContain('queue-depth')
  })

  it('never repeats the same alert inside its window setting', () => {
    const [alert] = evaluateAlerts({ ...quiet, keyFlags24h: 3 }, thresholds)
    expect(alert?.windowSeconds).toBeGreaterThanOrEqual(3600)
  })
})

describe('percentile', () => {
  it('interpolates and handles edge cases', () => {
    expect(percentile([], 0.95)).toBeNull()
    expect(percentile([7], 0.95)).toBe(7)
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3)
    expect(percentile([10, 20, 30, 40], 0.95)).toBeCloseTo(38.5, 5)
  })
})

describe('thresholdsFromEnv', () => {
  it('uses the documented defaults when nothing is set', () => {
    expect(thresholdsFromEnv({} as NodeJS.ProcessEnv)).toEqual({ costPerCycleUsd: 0.35, monthlyBudgetUsd: 0, overrideRate: 0.1 })
  })

  it('reads overrides and ignores invalid values', () => {
    const env = { COST_PER_CYCLE_ALERT_USD: '0.5', MONTHLY_BUDGET_USD: '2500', OVERRIDE_RATE_ALERT: 'nope' } as unknown as NodeJS.ProcessEnv
    expect(thresholdsFromEnv(env)).toEqual({ costPerCycleUsd: 0.5, monthlyBudgetUsd: 2500, overrideRate: 0.1 })
  })
})
