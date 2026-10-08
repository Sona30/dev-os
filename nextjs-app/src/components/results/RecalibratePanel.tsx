'use client'

import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { JobProgress } from '@/components/jobs/JobProgress'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useJob, useRetryJob } from '@/hooks/use-job'
import { ApiError, apiFetch } from '@/lib/client/api'

interface RecalibratePanelProps {
  cycleId: string
  /** The job already updating the levels, if there is one. */
  jobId: string | null
  onDone: () => void
}

/** Follows the job that updates the levels. If it never started, offers a button to start it. */
export function RecalibratePanel({ cycleId, jobId, onDone }: RecalibratePanelProps) {
  const [activeJobId, setActiveJobId] = useState<string | null>(jobId)
  // The job may be created a moment after this panel first appears; pick it up as soon as the server knows it.
  useEffect(() => {
    if (jobId) setActiveJobId(jobId)
  }, [jobId])
  const { job, connectionLost, recheck } = useJob(activeJobId, { onSuccess: onDone })
  const retry = useRetryJob()

  const start = useMutation({
    mutationFn: () =>
      apiFetch<{ jobId: string }>(`/api/cycles/${cycleId}/finalize`, { method: 'POST', body: { skipUnconfirmed: true } }),
    onSuccess: ({ jobId: started }) => setActiveJobId(started),
  })

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-h5">Setting the next level</h2>
      <p className="max-w-prose text-body text-text-secondary">
        We count up what your child showed and decide how the next worksheet should change.
      </p>
      {activeJobId ? (
        <JobProgress
          type="recalibrate"
          job={job}
          connectionLost={connectionLost}
          onRecheck={recheck}
          onRetry={() => retry.mutate(activeJobId)}
          retrying={retry.isPending}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {start.isError ? (
            <Alert tone="danger">
              {start.error instanceof ApiError ? start.error.message : 'We couldn’t start that. Please try again.'}
            </Alert>
          ) : null}
          <div>
            <Button loading={start.isPending} onClick={() => start.mutate()}>
              Update levels
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
