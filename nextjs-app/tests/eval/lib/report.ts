import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Shapes shared by the suites, the runner and the release gate (docs/specs/15 §4).

export type MetricStatus = 'measured' | 'skipped' | 'manual'

export interface MetricResult {
  /** Machine key used in thresholds.json, for example "e7_exact". */
  key: string
  suite: string
  label: string
  value: number | null
  /** How many items the value is based on. */
  n: number
  status: MetricStatus
  /** Why a metric was skipped, or how it was computed. */
  note?: string
  /** Up to 25 examples of what went wrong, so failures can be inspected. */
  failures: string[]
}

export interface CallStat {
  mode: string
  durationMs: number
  costUsd: number
  inputTokens: number
  outputTokens: number
}

export interface SuiteOutput {
  metrics: MetricResult[]
  details?: Record<string, unknown>
}

export interface EvalReport {
  generatedAt: string
  gitSha: string
  /** "mock" reports can never pass a beta or launch gate. */
  mode: 'mock' | 'live'
  models: string[]
  promptVersion: string | null
  kbVersion: string | null
  suitesRun: string[]
  metrics: MetricResult[]
  calls: CallStat[]
  details: Record<string, unknown>
}

export const measured = (
  suite: string,
  key: string,
  label: string,
  value: number | null,
  n: number,
  extra: { note?: string; failures?: string[] } = {},
): MetricResult => ({
  key,
  suite,
  label,
  value,
  n,
  status: value === null ? 'skipped' : 'measured',
  note: extra.note,
  failures: (extra.failures ?? []).slice(0, 25),
})

export const skipped = (suite: string, key: string, label: string, note: string): MetricResult => ({
  key,
  suite,
  label,
  value: null,
  n: 0,
  status: 'skipped',
  note,
  failures: [],
})

export const manual = (suite: string, key: string, label: string, note: string): MetricResult => ({
  key,
  suite,
  label,
  value: null,
  n: 0,
  status: 'manual',
  note,
  failures: [],
})

const format = (metric: MetricResult): string => {
  if (metric.value === null) return '—'
  if (metric.key.endsWith('_ms')) return `${Math.round(metric.value)} ms`
  if (metric.key.includes('cost')) return `$${metric.value.toFixed(4)}`
  if (metric.key.endsWith('_ece') || metric.key.endsWith('_gap')) return metric.value.toFixed(3)
  return `${(metric.value * 100).toFixed(1)}%`
}

export function renderMarkdown(report: EvalReport): string {
  const lines = [
    `# TestReady evaluation report`,
    '',
    `- Date: ${report.generatedAt}`,
    `- Commit: ${report.gitSha}`,
    `- Mode: **${report.mode}**${report.mode === 'mock' ? ' (fixture data only, not valid for release gates)' : ''}`,
    `- Models: ${report.models.join(', ') || 'n/a'}`,
    `- Prompt version: ${report.promptVersion ?? 'n/a'} · KB version: ${report.kbVersion ?? 'n/a'}`,
    `- Suites run: ${report.suitesRun.join(', ')}`,
    '',
    '| Metric | Suite | Value | n | Status | Note |',
    '|---|---|---|---|---|---|',
    ...report.metrics.map(
      (metric) =>
        `| ${metric.label} (\`${metric.key}\`) | ${metric.suite} | ${format(metric)} | ${metric.n} | ${metric.status} | ${metric.note ?? ''} |`,
    ),
    '',
  ]
  const withFailures = report.metrics.filter((metric) => metric.failures.length > 0)
  if (withFailures.length > 0) {
    lines.push('## Failures (first 25 per metric)', '')
    for (const metric of withFailures) {
      lines.push(`### ${metric.label} (\`${metric.key}\`)`, '', ...metric.failures.map((failure) => `- ${failure}`), '')
    }
  }
  return lines.join('\n')
}

export async function writeReport(dir: string, report: EvalReport, csv: string | null): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'report.json'), JSON.stringify(report, null, 2))
  await writeFile(path.join(dir, 'report.md'), renderMarkdown(report))
  if (csv) await writeFile(path.join(dir, 'sme-review.csv'), csv)
}

/** Escapes one CSV cell. */
export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
