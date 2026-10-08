'use client'

import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/client/api'
import { JOB_POLL_INTERVAL_MS } from '@/lib/constants'
import { TERMINAL_STATUSES, type JobDto } from '@/lib/jobs/types'

const jobKey = (jobId: string) => ['job', jobId] as const

interface UseJobOptions {
  onSuccess?: (job: JobDto) => void
  onFailure?: (job: JobDto) => void
}

/**
 * Polls GET /api/jobs/:id until the job finishes (docs/specs/04 §4).
 * Interval: 2 s, 2 s, 3 s, then 5 s. Polling pauses while the tab is hidden and resumes on focus.
 */
export function useJob(jobId: string | null, options: UseJobOptions = {}) {
  const query = useQuery({
    queryKey: jobKey(jobId ?? 'none'),
    enabled: jobId !== null,
    queryFn: () => apiFetch<JobDto>(`/api/jobs/${jobId}`),
    refetchOnWindowFocus: true,
    retry: 5,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
    refetchInterval: (current) => {
      const job = current.state.data
      if (job && TERMINAL_STATUSES.includes(job.status)) return false
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false
      const index = Math.min(current.state.dataUpdateCount, JOB_POLL_INTERVAL_MS.length - 1)
      return JOB_POLL_INTERVAL_MS[index] ?? 5000
    },
  })

  const job = query.data ?? null

  // Fire each callback once per job, when it reaches a terminal state.
  const notifiedFor = useRef<string | null>(null)
  const { onSuccess, onFailure } = options
  useEffect(() => {
    if (!job) return
    // A retried job goes back to queued/running under the same id; re-arm the callbacks.
    if (job.status === 'queued' || job.status === 'running') {
      notifiedFor.current = null
      return
    }
    if (notifiedFor.current === job.id) return
    if (job.status === 'succeeded') {
      notifiedFor.current = job.id
      onSuccess?.(job)
    } else if (job.status === 'failed') {
      notifiedFor.current = job.id
      onFailure?.(job)
    }
  }, [job, onSuccess, onFailure])

  return {
    job,
    /** Five polls in a row failed (network): show "connection lost" and offer a manual re-check. */
    connectionLost: query.isError,
    recheck: () => query.refetch(),
  }
}

/** Re-queues a failed job; the caller then follows the (same) job id again. */
export function useRetryJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (jobId: string) => apiFetch<{ jobId: string }>(`/api/jobs/${jobId}/retry`, { method: 'POST' }),
    onSuccess: ({ jobId }) => {
      // Refresh the job so polling resumes and the callbacks re-arm for the new attempt.
      queryClient.invalidateQueries({ queryKey: jobKey(jobId) })
    },
  })
}
