'use client'

import { useEffect, useRef, useState } from 'react'
import { JobProgress } from '@/components/jobs/JobProgress'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { useJob, useRetryJob } from '@/hooks/use-job'
import { ApiError, apiFetch } from '@/lib/client/api'

interface DiagnoseRunnerProps {
  childId: string
  reportId: string
  /** A job that is already running or failed for this report, if the server knows of one. */
  jobId: string | null
  onDone: () => void
}

/** Follows (or starts) the gap-analysis job for a confirmed report and calls onDone when the plan is ready. */
export function DiagnoseRunner({ childId, reportId, jobId, onDone }: DiagnoseRunnerProps) {
  const [activeJobId, setActiveJobId] = useState<string | null>(jobId)
  const [startError, setStartError] = useState<string | null>(null)
  const started = useRef(false)
  const retry = useRetryJob()

  // No job yet (for example the parent came back later): ask the server to start one.
  useEffect(() => {
    if (activeJobId || started.current) return
    started.current = true
    apiFetch<{ jobId?: string; diagnosisId?: string }>(`/api/children/${childId}/diagnoses`, {
      method: 'POST',
      body: { reportId },
    })
      .then((result) => {
        if (result.jobId) setActiveJobId(result.jobId)
        else onDone()
      })
      .catch((error) =>
        setStartError(error instanceof ApiError ? error.message : 'We couldn’t start the analysis. Please try again.'),
      )
  }, [activeJobId, childId, reportId, onDone])

  const { job, connectionLost, recheck } = useJob(activeJobId, { onSuccess: onDone })

  if (startError) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="danger">{startError}</Alert>
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              started.current = false
              setStartError(null)
              setActiveJobId(null)
            }}
          >
            Try again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <JobProgress
      type="diagnose"
      job={job}
      connectionLost={connectionLost}
      onRecheck={recheck}
      onRetry={() => activeJobId && retry.mutate(activeJobId)}
      retrying={retry.isPending}
    />
  )
}
