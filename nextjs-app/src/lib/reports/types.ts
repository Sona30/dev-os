import type { ConfirmedValues } from '@/lib/schemas/reports'
import type { ReportDraft } from './draft'

export type { ReportDraft, ConfirmedValues }

export type ParseStatus = 'pending' | 'parsed' | 'manual' | 'failed'

/** A report as the browser sees it (docs/specs/06 §3). */
export interface ReportDto {
  id: string
  childId: string
  source: 'upload' | 'manual'
  parseStatus: ParseStatus
  /** Set when the upload was not an i-Ready Math report. */
  rejectReason: string | null
  /** The editable "please confirm" values, until the parent has confirmed. */
  draft: ReportDraft | null
  confirmed: ConfirmedValues | null
  confirmedAt: string | null
  createdAt: string
  hasDiagnosis: boolean
  /** Latest background jobs for this report, so a page reload can re-attach to progress. */
  parseJobId: string | null
  diagnoseJobId: string | null
}
