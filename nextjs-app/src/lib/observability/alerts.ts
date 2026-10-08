import type { SupabaseClient } from '@supabase/supabase-js'

// Operational alerts (docs/specs/14 §5). `evaluateAlerts` is pure: given the numbers, it says what is wrong.
// `collectMetrics` reads the numbers from the database; `deliverAlerts` sends each alert at most once per window.

export type Severity = 'P1' | 'P2'

export interface Alert {
  /** Stable name, used to avoid sending the same alert again and again. */
  key: string
  severity: Severity
  title: string
  detail: string
  /** The same alert is not re-sent within this many seconds. */
  windowSeconds: number
}

export interface Metrics {
  cost7d: { cycles: number; costPerCycleUsd: number | null }
  monthSpendUsd: number
  override7d: { confirmed: number; rate: number | null }
  failures1h: Array<{ type: string; jobs: number; failed: number }>
  /** Seconds, over jobs that finished successfully in the last 24 hours. */
  latencyP95: Record<string, { jobs: number; p95Seconds: number }>
  keyFlags24h: number
  timeouts1h: number
  staleQueued: number
}

export interface Thresholds {
  costPerCycleUsd: number
  monthlyBudgetUsd: number
  overrideRate: number
}

// Smallest samples worth alerting on, so one odd job cannot page anyone.
const MIN_CYCLES_FOR_COST = 3
const MIN_ITEMS_FOR_OVERRIDE = 20
const MIN_JOBS_FOR_FAILURE_RATE = 10
const MIN_JOBS_FOR_LATENCY = 5
const FAILURE_RATE_LIMIT = 0.2
const STUCK_JOBS_LIMIT = 5
const QUEUE_DEPTH_LIMIT = 20
const HOUR = 3600
const DAY = 86400

// P95 limits in seconds from the PRD (s5): parse and diagnose 30, generate 90, grade 60.
const LATENCY_LIMITS: Record<string, number> = {
  parse_report: 30,
  diagnose: 30,
  generate_worksheet: 90,
  grade_sheet: 60,
}

const usd = (value: number) => `$${value.toFixed(2)}`
const pct = (value: number) => `${Math.round(value * 100)}%`

export function evaluateAlerts(metrics: Metrics, thresholds: Thresholds): Alert[] {
  const alerts: Alert[] = []

  const perCycle = metrics.cost7d.costPerCycleUsd
  if (perCycle !== null && metrics.cost7d.cycles >= MIN_CYCLES_FOR_COST && perCycle > thresholds.costPerCycleUsd) {
    alerts.push({
      key: 'cost-per-cycle',
      severity: 'P2',
      title: 'Cost per worksheet cycle is above target',
      detail: `${usd(perCycle)} per cycle over 7 days (alert above ${usd(thresholds.costPerCycleUsd)}, ${metrics.cost7d.cycles} cycles).`,
      windowSeconds: DAY,
    })
  }

  if (thresholds.monthlyBudgetUsd > 0) {
    const share = metrics.monthSpendUsd / thresholds.monthlyBudgetUsd
    if (share >= 1) {
      alerts.push({
        key: 'monthly-budget-exceeded',
        severity: 'P1',
        title: 'Monthly AI budget used up',
        detail: `${usd(metrics.monthSpendUsd)} spent of a ${usd(thresholds.monthlyBudgetUsd)} budget.`,
        windowSeconds: DAY,
      })
    } else if (share >= 0.8) {
      alerts.push({
        key: 'monthly-budget-80',
        severity: 'P2',
        title: 'Monthly AI budget is 80% used',
        detail: `${usd(metrics.monthSpendUsd)} spent of a ${usd(thresholds.monthlyBudgetUsd)} budget (${pct(share)}).`,
        windowSeconds: DAY,
      })
    }
  }

  const { rate, confirmed } = metrics.override7d
  if (rate !== null && confirmed >= MIN_ITEMS_FOR_OVERRIDE && rate > thresholds.overrideRate) {
    alerts.push({
      key: 'override-rate',
      severity: 'P2',
      title: 'Parents are correcting too many graded answers',
      detail: `${pct(rate)} of ${confirmed} confirmed answers were changed in 7 days (alert above ${pct(thresholds.overrideRate)}). Time for a prompt review.`,
      windowSeconds: DAY,
    })
  }

  const totalJobs = metrics.failures1h.reduce((sum, row) => sum + row.jobs, 0)
  const totalFailed = metrics.failures1h.reduce((sum, row) => sum + row.failed, 0)
  if (totalJobs >= MIN_JOBS_FOR_FAILURE_RATE && totalFailed / totalJobs > FAILURE_RATE_LIMIT) {
    const worst = [...metrics.failures1h].sort((a, b) => b.failed - a.failed)[0]
    alerts.push({
      key: 'job-failures',
      severity: 'P1',
      title: 'Many background jobs are failing',
      detail: `${totalFailed} of ${totalJobs} jobs failed in the last hour${worst ? ` (most: ${worst.type})` : ''}.`,
      windowSeconds: HOUR,
    })
  }

  for (const [type, limit] of Object.entries(LATENCY_LIMITS)) {
    const stats = metrics.latencyP95[type]
    if (stats && stats.jobs >= MIN_JOBS_FOR_LATENCY && stats.p95Seconds > limit) {
      alerts.push({
        key: `latency-${type}`,
        severity: 'P2',
        title: `${type} is slower than target`,
        detail: `95% of jobs finished within ${Math.round(stats.p95Seconds)}s over 24 hours (target ${limit}s, ${stats.jobs} jobs).`,
        windowSeconds: DAY,
      })
    }
  }

  if (metrics.keyFlags24h >= 1) {
    alerts.push({
      key: 'wrong-answer-key',
      severity: 'P1',
      title: 'A parent reported a wrong answer key',
      detail: `${metrics.keyFlags24h} report(s) in 24 hours. A wrong key reaching a family is a defect: find the worksheet and the failing check.`,
      windowSeconds: DAY,
    })
  }

  if (metrics.timeouts1h >= STUCK_JOBS_LIMIT) {
    alerts.push({
      key: 'stuck-jobs',
      severity: 'P1',
      title: 'Jobs are getting stuck',
      detail: `${metrics.timeouts1h} jobs timed out in the last hour.`,
      windowSeconds: HOUR,
    })
  }

  if (metrics.staleQueued > QUEUE_DEPTH_LIMIT) {
    alerts.push({
      key: 'queue-depth',
      severity: 'P1',
      title: 'Jobs are waiting too long to start',
      detail: `${metrics.staleQueued} jobs have been queued for over 30 seconds. Check the background function and AI quota.`,
      windowSeconds: HOUR,
    })
  }

  return alerts
}

/** The p-th percentile (0-1) by linear interpolation; null for an empty list. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * p
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  const weight = position - lower
  return (sorted[lower] as number) * (1 - weight) + (sorted[upper] as number) * weight
}

const num = (value: unknown): number => (value === null || value === undefined ? 0 : Number(value))

/** Reads the numbers the rules need. Uses the metrics views from the schema plus a few direct queries. */
export async function collectMetrics(service: SupabaseClient, now = new Date()): Promise<Metrics> {
  const dayAgo = new Date(now.getTime() - DAY * 1000).toISOString()
  const hourAgo = new Date(now.getTime() - HOUR * 1000).toISOString()
  const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000).toISOString()

  const [cost, month, override, failures, flags, timeouts, stale, finished] = await Promise.all([
    service.from('v_cost_per_cycle_7d').select('cycles, cost_per_cycle_usd').maybeSingle(),
    service.from('v_monthly_spend').select('spend_usd').maybeSingle(),
    service.from('v_override_rate_7d').select('confirmed_items, override_rate').maybeSingle(),
    service.from('v_job_failure_rate_1h').select('type, jobs, failed'),
    service.from('usage_events').select('id', { count: 'exact', head: true }).eq('event', 'key.flagged').gte('created_at', dayAgo),
    service.from('jobs').select('id', { count: 'exact', head: true }).eq('error_code', 'TIMEOUT').gte('finished_at', hourAgo),
    service.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'queued').lt('created_at', thirtySecondsAgo),
    service
      .from('jobs')
      .select('type, started_at, finished_at')
      .eq('status', 'succeeded')
      .gte('finished_at', dayAgo)
      .not('started_at', 'is', null)
      .limit(5000),
  ])
  for (const result of [cost, month, override, failures, flags, timeouts, stale, finished]) {
    if (result.error) throw result.error
  }

  const durations = new Map<string, number[]>()
  for (const row of (finished.data ?? []) as Array<{ type: string; started_at: string; finished_at: string }>) {
    const seconds = (new Date(row.finished_at).getTime() - new Date(row.started_at).getTime()) / 1000
    if (Number.isFinite(seconds) && seconds >= 0) durations.set(row.type, [...(durations.get(row.type) ?? []), seconds])
  }
  const latencyP95: Metrics['latencyP95'] = {}
  for (const [type, values] of Array.from(durations.entries())) {
    const p95 = percentile(values, 0.95)
    if (p95 !== null) latencyP95[type] = { jobs: values.length, p95Seconds: p95 }
  }

  const costRow = cost.data as { cycles: number; cost_per_cycle_usd: number | null } | null
  const overrideRow = override.data as { confirmed_items: number; override_rate: number | null } | null
  return {
    cost7d: {
      cycles: num(costRow?.cycles),
      costPerCycleUsd: costRow?.cost_per_cycle_usd === null || costRow?.cost_per_cycle_usd === undefined ? null : Number(costRow.cost_per_cycle_usd),
    },
    monthSpendUsd: num((month.data as { spend_usd: number } | null)?.spend_usd),
    override7d: {
      confirmed: num(overrideRow?.confirmed_items),
      rate: overrideRow?.override_rate === null || overrideRow?.override_rate === undefined ? null : Number(overrideRow.override_rate),
    },
    failures1h: ((failures.data ?? []) as Array<{ type: string; jobs: number; failed: number }>).map((row) => ({
      type: row.type,
      jobs: num(row.jobs),
      failed: num(row.failed),
    })),
    latencyP95,
    keyFlags24h: flags.count ?? 0,
    timeouts1h: timeouts.count ?? 0,
    staleQueued: stale.count ?? 0,
  }
}

export function thresholdsFromEnv(env: NodeJS.ProcessEnv = process.env): Thresholds {
  const read = (name: string, fallback: number) => {
    const value = Number(env[name])
    return env[name] && Number.isFinite(value) && value >= 0 ? value : fallback
  }
  return {
    costPerCycleUsd: read('COST_PER_CYCLE_ALERT_USD', 0.35),
    monthlyBudgetUsd: read('MONTHLY_BUDGET_USD', 0),
    overrideRate: read('OVERRIDE_RATE_ALERT', 0.1),
  }
}

export interface DeliveryResult {
  sent: string[]
  skipped: string[]
  failed: string[]
}

function formatMessage(alert: Alert, environment: string): string {
  return `[TestReady ${environment}] ${alert.severity}: ${alert.title} — ${alert.detail}`
}

async function postWebhook(url: string, text: string): Promise<boolean> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // "text" works for Slack and Teams incoming webhooks.
    body: JSON.stringify({ text }),
  })
  return response.ok
}

async function sendEmail(subject: string, text: string): Promise<boolean> {
  const key = process.env.EMAIL_PROVIDER_API_KEY
  const from = process.env.EMAIL_FROM
  const to = process.env.ALERT_EMAIL_TO
  if (!key || !from || !to) return false
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text }),
  })
  return response.ok
}

/**
 * Sends each alert at most once per its window (the counter lives in the database, so separate runs agree).
 * Delivery order: the chat webhook, then email. The alert is always written to the log as well.
 */
export async function deliverAlerts(
  service: SupabaseClient,
  alerts: Alert[],
  log: { error: (fields: object, message: string) => void },
  environment = process.env.APP_ENV || process.env.NODE_ENV || 'unknown',
): Promise<DeliveryResult> {
  const result: DeliveryResult = { sent: [], skipped: [], failed: [] }

  for (const alert of alerts) {
    const bucket = Math.floor(Date.now() / 1000 / alert.windowSeconds)
    const { data: allowed, error } = await service.rpc('rate_limit_hit', {
      p_key: `alert:${alert.key}:${bucket}`,
      p_window_seconds: alert.windowSeconds,
      p_max: 1,
    })
    if (!error && allowed === false) {
      result.skipped.push(alert.key)
      continue
    }

    const text = formatMessage(alert, environment)
    log.error({ alert: alert.key, severity: alert.severity }, text)

    let delivered = false
    try {
      const webhook = process.env.ALERT_WEBHOOK_URL
      if (webhook) delivered = await postWebhook(webhook, text)
      if (!delivered) delivered = await sendEmail(`[${alert.severity}] ${alert.title}`, text)
    } catch {
      delivered = false
    }
    // With no webhook or email configured, the log line above is the alert.
    const noChannelConfigured = !process.env.ALERT_WEBHOOK_URL && !process.env.ALERT_EMAIL_TO
    if (delivered || noChannelConfigured) result.sent.push(alert.key)
    else result.failed.push(alert.key)
  }
  return result
}
