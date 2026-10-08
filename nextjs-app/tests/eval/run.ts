import { execSync } from 'node:child_process'
import path from 'node:path'
import { mean, percentile } from './lib/metrics'
import { manual, measured, skipped, writeReport, type CallStat, type EvalReport, type MetricResult } from './lib/report'

// npm run eval -- [--suite=E1,E3,E7,E11,E16] [--children=4] [--cycles=3] [--out=eval-reports]
// Runs the evaluation suites against the real pipeline functions (not over HTTP) and writes
// <out>/<date>-<gitsha>/{report.json,report.md,sme-review.csv}. docs/specs/15 §4.

function arg(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3)
}

function loadEnv(): void {
  try {
    ;(process as unknown as { loadEnvFile: (file: string) => void }).loadEnvFile('.env.local')
  } catch {
    // No .env.local: rely on the shell environment.
  }
}

function gitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'nogit'
  }
}

// Which suites feed which metric families.
const GROUPS: Record<string, string> = {
  E1: 'parse', E3: 'generation', E5: 'generation', E6: 'generation', E15: 'generation',
  E7: 'grading', E8: 'grading', E9: 'grading', E10: 'grading', E14: 'grading', E11: 'recalibration', E16: 'adversarial',
}

function latencyAndCost(calls: CallStat[]): MetricResult[] {
  const p95 = (mode: string) => percentile(calls.filter((call) => call.mode === mode).map((call) => call.durationMs), 95)
  const parse = p95('parse')
  const diagnose = p95('diagnose')
  const parts = [parse, diagnose].filter((value): value is number => value !== null)
  const avgCost = (mode: string) => mean(calls.filter((call) => call.mode === mode).map((call) => call.costUsd))
  const costParts = (['parse', 'diagnose', 'generate', 'grade', 'explain'] as const)
    .map((mode) => ({ mode, cost: avgCost(mode) }))
    .filter((entry): entry is { mode: (typeof entry)['mode']; cost: number } => entry.cost !== null)
  return [
    measured('E12', 'e12_parse_diagnose_p95_ms', 'Parse + diagnose latency (P95)', parts.length ? parts.reduce((a, b) => a + b, 0) : null, parts.length, {
      note: 'Sum of the P95s that were measured; an upper bound.',
    }),
    measured('E12', 'e12_generate_p95_ms', 'Generate latency (P95)', p95('generate'), calls.filter((call) => call.mode === 'generate').length),
    measured('E12', 'e12_grade_p95_ms', 'Grade latency (P95)', p95('grade'), calls.filter((call) => call.mode === 'grade').length),
    measured('E13', 'e13_cost_per_cycle', 'Estimated agent cost per cycle', costParts.length ? costParts.reduce((sum, entry) => sum + entry.cost, 0) : null, calls.length, {
      note: `Sum of the average cost of ${costParts.map((entry) => entry.mode).join(', ') || 'no'} calls. Missing modes make this a lower bound. Needs FOUNDRY_PRICE_* set to be meaningful.`,
    }),
  ]
}

async function main(): Promise<void> {
  loadEnv()
  const requested = (arg('suite') ?? 'E1,E3,E7,E11,E16').split(',').map((value) => value.trim().toUpperCase())
  const groups = new Set(requested.map((suite) => GROUPS[suite]).filter((group): group is string => Boolean(group)))
  if (groups.size === 0) throw new Error(`Unknown suite. Choose from ${Object.keys(GROUPS).join(', ')}.`)

  const mock = process.env.FOUNDRY_MOCK === 'true'
  if (!mock && groups.size > 0 && Array.from(groups).some((group) => group !== 'recalibration')) {
    console.log('Running against the live Foundry agent. This spends money; watch the cost line in the report.')
  }

  const { Recorder } = await import('./lib/recorder')
  const recorder = new Recorder()
  const metrics: MetricResult[] = []
  const details: Record<string, unknown> = {}
  let csv: string | null = null

  if (groups.has('recalibration')) {
    const { runE11 } = await import('./suites/e11-recalibration')
    metrics.push(...runE11().metrics)
  }
  if (groups.has('parse')) {
    const { runE1 } = await import('./suites/e1-parse')
    metrics.push(...(await runE1(recorder)).metrics)
  }
  if (groups.has('generation')) {
    const { runGeneration } = await import('./suites/generation')
    const out = await runGeneration(recorder, {
      children: Number(arg('children')) || 4,
      cycles: Number(arg('cycles')) || 3,
    })
    metrics.push(...out.metrics)
    details.generation = out.details
  }
  if (groups.has('grading')) {
    const { runGrading } = await import('./suites/grading')
    const out = await runGrading(recorder)
    metrics.push(...out.metrics)
    details.grading = out.details
    csv = out.csv
  }
  if (groups.has('adversarial')) {
    const { runE16 } = await import('./suites/e16-adversarial')
    metrics.push(...(await runE16(recorder)).metrics)
  }

  if (recorder.calls.length > 0) metrics.push(...latencyAndCost(recorder.calls))
  else metrics.push(skipped('E12', 'e12_generate_p95_ms', 'Latency and cost', 'No agent calls were made in this run.'))
  metrics.push(
    manual('E2', 'e2_gap_mapping', 'Gap mapping reviewed by an educator', 'Manual: have an educator rate 20 diagnoses; also check every skill id is in the catalogue.'),
    manual('E4', 'e4_math_fidelity', 'Math-level fidelity', 'Manual: educator rates a sample of 200 items against the intended skill and level.'),
  )

  const report: EvalReport = {
    generatedAt: new Date().toISOString(),
    gitSha: gitSha(),
    mode: mock ? 'mock' : 'live',
    models: Array.from(recorder.models),
    promptVersion: recorder.promptVersion,
    kbVersion: recorder.kbVersion,
    suitesRun: requested,
    metrics,
    calls: recorder.calls,
    details,
  }

  const outDir = path.resolve(arg('out') ?? process.env.EVAL_REPORT_DIR ?? 'eval-reports', `${new Date().toISOString().slice(0, 10)}-${report.gitSha}`)
  await writeReport(outDir, report, csv)

  for (const metric of metrics) {
    const value = metric.value === null ? '—' : Number.isInteger(metric.value) ? String(metric.value) : metric.value.toFixed(3)
    console.log(`${metric.status.padEnd(8)} ${metric.key.padEnd(28)} ${value.padStart(10)}  n=${metric.n}${metric.note ? `  (${metric.note})` : ''}`)
  }
  console.log(`\nReport written to ${outDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
