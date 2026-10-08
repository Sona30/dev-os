'use client'

import { JobProgress } from '@/components/jobs/JobProgress'
import { Card } from '@/components/ui/Card'
import { useJob, useRetryJob } from '@/hooks/use-job'
import type { JobDto } from '@/lib/jobs/types'

interface GradingPanelProps {
  jobId: string | null
  onSuccess: (job: JobDto) => void
  onFailure: (job: JobDto) => void
}

/** Live progress while the photo is checked and answers are read. */
export function GradingPanel({ jobId, onSuccess, onFailure }: GradingPanelProps) {
  const { job, connectionLost, recheck } = useJob(jobId, { onSuccess, onFailure })
  const retry = useRetryJob()

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-h5">Checking the sheet</h2>
      <p className="text-body text-text-secondary">
        We read each answer, then compare it with the answer key. This usually takes under a minute.
      </p>
      <JobProgress
        type="grade_sheet"
        job={job}
        connectionLost={connectionLost}
        onRecheck={recheck}
        onRetry={() => jobId && retry.mutate(jobId)}
        retrying={retry.isPending}
      />
    </Card>
  )
}
