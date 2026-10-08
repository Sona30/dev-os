'use client'

import { JobProgress } from '@/components/jobs/JobProgress'
import { Card } from '@/components/ui/Card'
import { useJob, useRetryJob } from '@/hooks/use-job'
import type { JobDto } from '@/lib/jobs/types'

interface GeneratingPanelProps {
  jobId: string | null
  onSuccess: (job: JobDto) => void
  onFailure: (job: JobDto) => void
}

/** Live progress while a worksheet is written, checked and turned into PDFs. */
export function GeneratingPanel({ jobId, onSuccess, onFailure }: GeneratingPanelProps) {
  const { job, connectionLost, recheck } = useJob(jobId, { onSuccess, onFailure })
  const retry = useRetryJob()

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-h5">Creating the worksheet</h2>
      <p className="text-body text-text-secondary">
        We write each problem, check every answer, then build the printable sheet and parent answer key. This usually
        takes about a minute.
      </p>
      <JobProgress
        type="generate_worksheet"
        job={job}
        connectionLost={connectionLost}
        onRecheck={recheck}
        onRetry={() => jobId && retry.mutate(jobId)}
        retrying={retry.isPending}
      />
    </Card>
  )
}
