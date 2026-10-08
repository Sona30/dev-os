import { ratio } from '../lib/metrics'
import { loadCases, reportLabel } from '../lib/dataset'
import { measured, skipped, type MetricResult, type SuiteOutput } from '../lib/report'
import { describeError, type Recorder } from '../lib/recorder'

// E1: field-level accuracy of reading i-Ready reports against two-reviewer labels.

const same = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()

export async function runE1(recorder: Recorder): Promise<SuiteOutput> {
  const cases = await loadCases('reports', reportLabel)
  if (cases.length === 0) {
    const note = 'No labelled reports found in EVAL_DATA_DIR/reports (see tests/eval/DATASET_CARD.md).'
    return {
      metrics: [
        skipped('E1', 'e1_overall_score', 'Overall score accuracy', note),
        skipped('E1', 'e1_placement', 'Placement accuracy', note),
        skipped('E1', 'e1_domains', 'Domain result accuracy', note),
      ],
    }
  }

  let scoreRight = 0
  let placementRight = 0
  let windowRight = 0
  let windowTotal = 0
  let domainRight = 0
  let domainTotal = 0
  const failures: string[] = []

  for (const item of cases) {
    const { label } = item
    domainTotal += label.domains.length
    let out
    try {
      out = (await recorder.call({ mode: 'parse', input: { grade: label.grade, child_nickname: 'Maya' }, images: item.images })).data
    } catch (error) {
      failures.push(`${item.id}: ${describeError(error)}`)
      continue
    }
    if (out.status !== 'ok') {
      failures.push(`${item.id}: rejected a real report (${out.rejectReason ?? 'no reason'})`)
      continue
    }
    if (out.overallScore === label.overallScore) scoreRight++
    else failures.push(`${item.id}: overall score ${out.overallScore} (expected ${label.overallScore})`)
    if (same(out.placement, label.placement)) placementRight++
    else failures.push(`${item.id}: placement "${out.placement}" (expected "${label.placement}")`)
    if (label.window !== undefined) {
      windowTotal++
      if (out.window === label.window) windowRight++
    }
    for (const expected of label.domains) {
      const found = out.domains.find((domain) => same(domain.domain, expected.domain))
      const placementOk = found !== undefined && same(found.placement, expected.placement)
      const scoreOk = expected.score === undefined || (found !== undefined && found.score === expected.score)
      if (placementOk && scoreOk) domainRight++
      else failures.push(`${item.id}: domain "${expected.domain}" read as ${found ? `${found.placement}/${found.score}` : 'missing'}`)
    }
  }

  const metrics: MetricResult[] = [
    measured('E1', 'e1_overall_score', 'Overall score accuracy', ratio(scoreRight, cases.length), cases.length, { failures }),
    measured('E1', 'e1_placement', 'Placement accuracy', ratio(placementRight, cases.length), cases.length),
    measured('E1', 'e1_domains', 'Domain result accuracy', ratio(domainRight, domainTotal), domainTotal),
    measured('E1', 'e1_window', 'Assessment window accuracy (info)', ratio(windowRight, windowTotal), windowTotal),
  ]
  return { metrics }
}
