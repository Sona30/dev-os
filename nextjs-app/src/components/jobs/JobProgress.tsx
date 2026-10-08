'use client'

import { useEffect, useState } from 'react'
import { Check, Circle, Loader2 } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { JOB_STEPS } from '@/lib/jobs/steps'
import type { JobDto, JobType } from '@/lib/jobs/types'
import { cn } from '@/lib/utils'

interface JobProgressProps {
  type: JobType
  job: JobDto | null
  connectionLost?: boolean
  onRecheck?: () => void
  onRetry?: () => void
  retrying?: boolean
  onCancel?: () => void
}

const SLOW_AFTER_MS = 120_000

/** Live stepper for a background job: step labels, percent, a slow-run hint, and Try again on failure. */
export function JobProgress({ type, job, connectionLost, onRecheck, onRetry, retrying, onCancel }: JobProgressProps) {
  const steps = JOB_STEPS[type]
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    setSlow(false)
    if (!job || job.status === 'succeeded' || job.status === 'failed') return
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => clearTimeout(timer)
  }, [job?.id, job?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const percent = job?.status === 'succeeded' ? 100 : (job?.progress.percent ?? 0)
  const currentIndex = job ? steps.findIndex((step) => step.id === job.progress.step) : -1
  const failed = job?.status === 'failed'

  return (
    <div className="flex flex-col gap-4" aria-busy={!failed && job?.status !== 'succeeded'}>
      <div
        role="progressbar"
        aria-label="Progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 w-full overflow-hidden rounded-sm bg-subtle"
      >
        <div
          className={cn(
            'h-full transition-[width] duration-panel ease-enter',
            failed ? 'bg-danger' : 'bg-brand',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>

      <ol className="flex list-none flex-col gap-2 p-0" aria-live="polite">
        {steps.map((step, index) => {
          const done = job?.status === 'succeeded' || index < currentIndex
          const active = !failed && job?.status !== 'succeeded' && index === currentIndex
          return (
            <li
              key={step.id}
              className={cn(
                'flex items-center gap-3 text-body',
                done || active ? 'text-text-primary' : 'text-text-secondary',
              )}
              aria-current={active ? 'step' : undefined}
            >
              {done ? (
                <Check className="h-5 w-5 text-success" aria-hidden="true" />
              ) : active ? (
                <Loader2 className="h-5 w-5 animate-spin text-brand" aria-hidden="true" />
              ) : (
                <Circle className="h-5 w-5 text-line-strong" aria-hidden="true" />
              )}
              <span>
                {step.label}
                <span className="sr-only">{done ? ' — done' : active ? ' — in progress' : ' — waiting'}</span>
              </span>
            </li>
          )
        })}
      </ol>

      {!job || job.status === 'queued' ? (
        <p className="text-caption text-text-secondary">Starting…</p>
      ) : null}

      {slow ? <p className="text-caption text-text-secondary">This is taking longer than usual. You can leave this page open.</p> : null}

      {connectionLost ? (
        <Alert tone="warning">
          <p>We lost touch with the server, but your task is still running.</p>
          {onRecheck ? (
            <Button variant="secondary" size="sm" className="mt-2" onClick={onRecheck}>
              Check again
            </Button>
          ) : null}
        </Alert>
      ) : null}

      {failed && job?.error ? (
        <Alert tone="danger">
          <p>{job.error.message}</p>
          {job.error.retryable && onRetry ? (
            <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry} loading={retrying}>
              Try again
            </Button>
          ) : null}
        </Alert>
      ) : null}

      {onCancel && !failed && job?.status !== 'succeeded' ? (
        <div>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Stop watching
          </Button>
        </div>
      ) : null}
    </div>
  )
}
