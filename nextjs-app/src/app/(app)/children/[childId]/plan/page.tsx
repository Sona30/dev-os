import type { Metadata } from 'next'
import Link from 'next/link'
import { DiagnosisView } from '@/components/plan/DiagnosisView'
import { PlanEmpty } from '@/components/plan/PlanEmpty'
import { buttonStyles } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { WorksheetSection } from '@/components/worksheets/WorksheetSection'
import { requireChild } from '@/lib/children/children.service'
import { findLatestDiagnosis } from '@/lib/diagnosis/diagnosis.service'
import { getLatestReport } from '@/lib/reports/reports.service'
import { childIdParams } from '@/lib/schemas/children'
import { createServerClient } from '@/lib/supabase/server'
import { getWorksheetState } from '@/lib/worksheets/worksheets.service'

export const metadata: Metadata = { title: 'Gap analysis' }
export const dynamic = 'force-dynamic'

export default async function PlanPage({ params }: { params: { childId: string } }) {
  const { childId } = childIdParams.parse(params)
  const supabase = createServerClient()
  const child = await requireChild(supabase, childId)

  const diagnosis = await findLatestDiagnosis(supabase, childId)
  if (diagnosis) {
    const worksheetState = await getWorksheetState(supabase, childId)
    return (
      <div className="flex flex-col gap-10">
        <DiagnosisView diagnosis={diagnosis} nickname={child.nickname} />
        <section aria-label="Worksheet" className="border-t border-line pt-10">
          <WorksheetSection
            childId={childId}
            diagnosisId={diagnosis.id}
            gaps={diagnosis.gaps}
            initialState={worksheetState}
          />
        </section>
      </div>
    )
  }

  const report = await getLatestReport(supabase, child)
  if (report?.confirmedAt) {
    return <PlanEmpty childId={childId} reportId={report.id} diagnoseJobId={report.diagnoseJobId} />
  }

  return (
    <EmptyState
      title="No gap analysis yet"
      description="Enter your child’s i-Ready Math result first. Then we’ll show which concepts to practise."
      action={
        <Link href={`/children/${childId}/setup`} className={buttonStyles()}>
          Enter the result
        </Link>
      }
    />
  )
}
