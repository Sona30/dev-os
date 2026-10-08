import type { JobRunner } from '../context'
import type { JobType } from '../types'
import { runDeleteChild } from './delete-child'
import { runDiagnose } from './diagnose'
import { runGenerateWorksheet } from './generate-worksheet'
import { runGradeSheet } from './grade-sheet'
import { runParseReport } from './parse-report'
import { runRecalibrate } from './recalibrate'
import { runRerenderPdf } from './rerender-pdf'

/** Registry of job runners, one per job type. A job whose type has no runner fails with INTERNAL. */
export const RUNNERS: Partial<Record<JobType, JobRunner>> = {
  delete_child: runDeleteChild,
  diagnose: runDiagnose,
  generate_worksheet: runGenerateWorksheet,
  grade_sheet: runGradeSheet,
  parse_report: runParseReport,
  recalibrate: runRecalibrate,
  rerender_pdf: runRerenderPdf,
}
