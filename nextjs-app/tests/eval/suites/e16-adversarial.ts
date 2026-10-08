import { AppError } from '@/lib/errors/app-error'
import { adversarialLabel, loadCases } from '../lib/dataset'
import { measured, skipped, type SuiteOutput } from '../lib/report'
import { ratio } from '../lib/metrics'
import { describeError, type Recorder } from '../lib/recorder'

// E16: inputs that must NOT produce invented results — non-i-Ready images, the wrong subject, an empty sheet, a
// photo of someone else's sheet — plus valid-but-awkward inputs (a rotated report) that must still work.

const REFUSALS = ['PHOTO_QUALITY', 'UNSUPPORTED_MEDIA', 'SHEET_MISMATCH', 'AI_INVALID_OUTPUT']

export async function runE16(recorder: Recorder): Promise<SuiteOutput> {
  const cases = await loadCases('adversarial', adversarialLabel)
  if (cases.length === 0) {
    return {
      metrics: [skipped('E16', 'e16_adversarial', 'Adversarial inputs handled correctly', 'No cases found in EVAL_DATA_DIR/adversarial.')],
    }
  }
  let pass = 0
  const failures: string[] = []
  for (const item of cases) {
    const { label } = item
    try {
      if (label.mode === 'parse') {
        const out = (await recorder.call({ mode: 'parse', input: { grade: label.grade, child_nickname: 'Maya' }, images: item.images })).data
        const ok =
          label.expect === 'reject'
            ? out.status === 'rejected_input' && out.overallScore === null
            : out.status === 'ok' && (label.overallScore === undefined || out.overallScore === label.overallScore)
        if (ok) pass++
        else failures.push(`${item.id} (${label.kind}): expected ${label.expect}, got status ${out.status}, score ${out.overallScore}`)
      } else {
        if (!label.key || !label.sheetId) throw new Error('grade cases need key and sheetId in the label')
        const out = (
          await recorder.call({
            mode: 'grade',
            input: {
              sheet_id: label.sheetId,
              key: label.key,
              child_profile: {
                child: { nickname: 'Maya', grade: label.grade },
                baseline: { overallScore: null, placement: null, window: null, reportDate: null },
                reading: { lexile: null, band: null, estimated: true, confidence: 'low' },
                skills: [],
                cycles: [],
                flags: [],
              },
            },
            images: item.images,
          })
        ).data
        const blank = (answer: string | null) => (answer ?? '').trim() === ''
        const ok =
          label.expect === 'blank'
            ? out.items.every((entry) => blank(entry.extractedAnswer))
            : label.expect === 'reject'
              ? out.sheetId !== label.sheetId || out.sheetIdConfidence < 0.85 || out.qualityAssessment !== 'good'
              : out.sheetId === label.sheetId
        if (ok) pass++
        else failures.push(`${item.id} (${label.kind}): expected ${label.expect}, got sheetId ${out.sheetId}, quality ${out.qualityAssessment}`)
      }
    } catch (error) {
      // A polite refusal from the app (for example PHOTO_QUALITY) is also acceptable for "reject" cases.
      // An outage or any other error is not: it proves nothing about how the input is handled.
      if (label.expect === 'reject' && error instanceof AppError && REFUSALS.includes(error.code)) pass++
      else failures.push(`${item.id} (${label.kind}): ${describeError(error)}`)
    }
  }
  return { metrics: [measured('E16', 'e16_adversarial', 'Adversarial inputs handled correctly', ratio(pass, cases.length), cases.length, { failures })] }
}
