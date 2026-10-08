'use client'

import { useRouter } from 'next/navigation'
import { DiagnoseRunner } from '@/components/plan/DiagnoseRunner'
import { Card } from '@/components/ui/Card'

interface PlanEmptyProps {
  childId: string
  reportId: string
  diagnoseJobId: string | null
}

/** A confirmed report with no analysis yet (for example an earlier attempt failed): run it from here. */
export function PlanEmpty({ childId, reportId, diagnoseJobId }: PlanEmptyProps) {
  const router = useRouter()
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-h5">Finding what to practise</h2>
      <DiagnoseRunner childId={childId} reportId={reportId} jobId={diagnoseJobId} onDone={() => router.refresh()} />
    </Card>
  )
}
