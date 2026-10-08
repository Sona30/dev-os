import { compareAnswer, type KeyAnswer } from '@/lib/grading/compare'
import { csvCell } from '../lib/report'
import { expectedCalibrationError, ratio, segmentCuts, type CalibrationPoint, type SegmentedResult } from '../lib/metrics'
import { loadCases, sheetLabel } from '../lib/dataset'
import { measured, skipped, type SuiteOutput } from '../lib/report'
import { describeError, type Recorder } from '../lib/recorder'

// E7 handwriting extraction, E8 confidence calibration, E9 grading agreement, E10 error-type attribution,
// E14 fairness cuts. One pass over the labelled sheets feeds all five.

const normalise = (text: string | null | undefined) => (text ?? '').trim().toLowerCase().replace(/\s+/g, '')

export const SME_CSV_HEADER = [
  'Sheet_ID', 'Grade', 'Skill', 'Math_Level', 'Reading_Band', 'Expected_Answer', 'Child_Written', 'AI_Extracted',
  'Extraction_Confidence', 'Match', 'SME_Error_Type', 'AI_Error_Type', 'Parent_Override', 'Notes',
]

export async function runGrading(recorder: Recorder): Promise<SuiteOutput & { csv: string | null }> {
  const cases = await loadCases('sheets', sheetLabel)
  const threshold = Number(process.env.EXTRACTION_CONFIDENCE_THRESHOLD) || 0.85
  if (cases.length === 0) {
    const note = 'No labelled sheets found in EVAL_DATA_DIR/sheets (see tests/eval/DATASET_CARD.md).'
    return {
      csv: null,
      metrics: [
        skipped('E7', 'e7_exact', 'Handwriting extraction exact match', note),
        skipped('E7', 'e7_flagged_errors', 'Extraction errors flagged as low confidence', note),
        skipped('E8', 'e8_ece', 'Expected calibration error', note),
        skipped('E9', 'e9_agreement', 'Grading agreement with the SME', note),
        skipped('E10', 'e10_error_type', 'Error-type agreement with the SME', note),
        skipped('E14', 'e14_segment_gap', 'Worst segment gap below overall', note),
      ],
    }
  }

  let items = 0
  let exact = 0
  let wrongExtractions = 0
  let wrongFlagged = 0
  let gradeAgree = 0
  let typeCompared = 0
  let typeAgree = 0
  let typeUnclear = 0
  let sheetIdRight = 0
  const points: CalibrationPoint[] = []
  const segmented: SegmentedResult[] = []
  const failures: string[] = []
  const rows: string[] = [SME_CSV_HEADER.join(',')]

  for (const sheet of cases) {
    const { label } = sheet
    const keyByPosition = new Map(label.key.map((row) => [row.position, row]))
    let out
    try {
      out = (
        await recorder.call({
          mode: 'grade',
          input: { sheet_id: label.sheetId, key: label.key, child_profile: emptyProfile(label.grade) },
          images: sheet.images,
        })
      ).data
    } catch (error) {
      failures.push(`${sheet.id}: ${describeError(error)}`)
      items += label.items.length
      for (let index = 0; index < label.items.length; index++) segmented.push({ segments: label.segments, correct: false })
      continue
    }
    if (out.sheetId === label.sheetId) sheetIdRight++

    for (const expected of label.items) {
      items++
      const read = out.items.find((entry) => entry.position === expected.position)
      const extracted = read?.extractedAnswer ?? null
      const confidence = read?.extractionConfidence ?? 0
      const matches = normalise(extracted) === normalise(expected.written)
      if (matches) exact++
      else {
        wrongExtractions++
        if (confidence < threshold) wrongFlagged++
        failures.push(`${sheet.id} #${expected.position}: read "${extracted ?? ''}" (written "${expected.written}", confidence ${confidence.toFixed(2)})`)
      }
      points.push({ confidence, correct: matches })
      segmented.push({ segments: { ...label.segments, grade: String(label.grade) }, correct: matches })

      // E9: the app decides right/wrong in code from what was extracted; compare with the SME's verdict.
      const keyRow = keyByPosition.get(expected.position)
      if (keyRow) {
        const key: KeyAnswer = {
          answerType: keyRow.answer_type,
          correctAnswer: keyRow.correct_answer,
          acceptedAnswers: keyRow.accepted_answers,
        }
        const verdict = compareAnswer(extracted, key).status === 'correct'
        if (verdict === expected.correct) gradeAgree++
      }

      // E10: error type, for answers the SME marked wrong and labelled.
      if (!expected.correct && expected.errorType && read?.errorType) {
        if (read.errorType === 'unclear') typeUnclear++
        else {
          typeCompared++
          if (read.errorType === expected.errorType) typeAgree++
        }
      }

      rows.push(
        [
          label.sheetId, label.grade, keyRow?.skill_id, keyRow?.math_level, keyRow?.reading_band, keyRow?.correct_answer,
          expected.written, extracted, read?.extractionConfidence, matches ? 'Y' : 'N', expected.errorType ?? '',
          read?.errorType ?? '', '', '',
        ]
          .map(csvCell)
          .join(','),
      )
    }
  }

  const cuts = segmentCuts(segmented)
  const worst = cuts[0]
  const ece = expectedCalibrationError(points)
  return {
    csv: rows.join('\n'),
    metrics: [
      measured('E7', 'e7_exact', 'Handwriting extraction exact match', ratio(exact, items), items, { failures }),
      measured('E7', 'e7_flagged_errors', 'Extraction errors flagged as low confidence', wrongExtractions === 0 ? 1 : ratio(wrongFlagged, wrongExtractions), wrongExtractions, {
        note: wrongExtractions === 0 ? 'No extraction errors, so this holds trivially.' : `Threshold ${threshold}.`,
      }),
      measured('E8', 'e8_ece', 'Expected calibration error', ece, points.length),
      measured('E9', 'e9_agreement', 'Grading agreement with the SME', ratio(gradeAgree, items), items, {
        note: 'Computed on SME-labelled sheets here; re-measure on parent-confirmed beta data.',
      }),
      measured('E10', 'e10_error_type', 'Error-type agreement with the SME', ratio(typeAgree, typeCompared), typeCompared, {
        note: `${typeUnclear} answers were labelled "unclear" by the model and are not counted against it.`,
      }),
      measured('E14', 'e14_segment_gap', 'Worst segment gap below overall', worst ? Math.max(0, worst.gapBelowOverall) : null, cuts.length, {
        note: worst ? `${worst.dimension}=${worst.value}: ${(worst.accuracy * 100).toFixed(1)}% (n=${worst.n})` : 'No segment has enough samples yet.',
      }),
      measured('E7', 'e7_sheet_id', 'Sheet ID read correctly (info)', ratio(sheetIdRight, cases.length), cases.length),
    ],
    details: { segmentCuts: cuts },
  }
}

function emptyProfile(grade: 1 | 2) {
  return {
    child: { nickname: 'Maya', grade },
    baseline: { overallScore: null, placement: null, window: null, reportDate: null },
    reading: { lexile: null, band: null, estimated: true, confidence: 'low' as const },
    skills: [],
    cycles: [],
    flags: [],
  }
}
