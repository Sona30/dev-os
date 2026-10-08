import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { evaluateGate, type Stage, type Thresholds } from './lib/gate'
import type { EvalReport } from './lib/report'

// npm run eval:gate -- --report=<dir or report.json> --stage=alpha|beta|launch
// Exits 1 when the report does not meet the stage's thresholds.

function arg(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3)
}

async function main(): Promise<number> {
  const stage = (arg('stage') ?? 'alpha') as Stage
  if (!['alpha', 'beta', 'launch'].includes(stage)) {
    console.error('--stage must be alpha, beta or launch.')
    return 2
  }
  const target = arg('report')
  if (!target) {
    console.error('Pass --report=<report directory or report.json>.')
    return 2
  }
  const file = target.endsWith('.json') ? target : path.join(target, 'report.json')
  const report = JSON.parse(await readFile(file, 'utf8')) as EvalReport
  const thresholds = JSON.parse(await readFile(path.resolve('tests/eval/thresholds.json'), 'utf8')) as Thresholds

  const result = evaluateGate(report, thresholds, stage)
  for (const line of result.lines) {
    const value = line.value === null ? '—' : String(line.value)
    console.log(`${line.status.toUpperCase().padEnd(7)} ${line.key.padEnd(28)} ${value.padStart(10)}   needs ${line.rule}`)
  }
  console.log(result.passed ? `\n${stage} gate: PASSED` : `\n${stage} gate: FAILED\n- ${result.problems.join('\n- ')}`)
  return result.passed ? 0 : 1
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error)
    process.exit(2)
  },
)
