import { DataConfidenceBadge, dataConfidenceDetail } from '@/components/plan/DataConfidenceBadge'
import { GlossaryTerm } from '@/components/plan/GlossaryTerm'
import { Card } from '@/components/ui/Card'
import { gradeLabel } from '@/lib/children/format'
import type { DiagnosisDto } from '@/lib/diagnosis/types'

const WINDOWS = { BOY: 'Beginning of year', MOY: 'Middle of year', EOY: 'End of year' } as const

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-body text-text-primary">{label}</dt>
      <dd className="text-caption text-text-secondary">{children}</dd>
    </div>
  )
}

/** The facts the analysis is based on, and how much to trust it. */
export function KeyDataCard({ diagnosis }: { diagnosis: DiagnosisDto }) {
  const { basis, readingBand } = diagnosis
  return (
    <Card>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Row label="Grade">{gradeLabel(basis.grade)}</Row>
        <Row label={<GlossaryTerm term="scale score">Overall scale score</GlossaryTerm>}>
          {basis.overallScore ?? 'Not provided'}
        </Row>
        <Row label={<GlossaryTerm term="placement">Overall placement</GlossaryTerm>}>
          {basis.placement ?? 'Not provided'}
        </Row>
        <Row label="Test window">{basis.window ? WINDOWS[basis.window] : 'Not provided'}</Row>
        <Row label="Reading level">
          {readingBand.band
            ? basis.lexile !== null
              ? `${readingBand.band} (from Lexile ${basis.lexile}, approximate)`
              : `${readingBand.band} (estimated — the first worksheet will help us pin it down)`
            : 'Not set yet'}
        </Row>
        <Row label={<GlossaryTerm term="data confidence">Data confidence</GlossaryTerm>}>
          <span className="flex flex-wrap items-center gap-2">
            <DataConfidenceBadge level={diagnosis.dataConfidence} />
            <span>{dataConfidenceDetail(diagnosis.dataConfidence)}</span>
          </span>
        </Row>
      </dl>
    </Card>
  )
}
