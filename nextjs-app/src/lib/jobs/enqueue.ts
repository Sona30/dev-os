import { AppError } from '@/lib/errors/app-error'
import { createServiceClient } from '@/lib/supabase/service'
import { triggerJob } from './trigger'
import type { JobType } from './types'

const ACTIVE_STATUSES = ['queued', 'running']

function maxConcurrentPerUser(): number {
  const configured = Number(process.env.JOB_MAX_CONCURRENT_PER_USER)
  return Number.isInteger(configured) && configured > 0 ? configured : 2
}

export interface EnqueueParams {
  userId: string
  /** Null for jobs that outlive their child (delete_child). */
  childId: string | null
  type: JobType
  /** Ids and small options only — never image bytes or personal data. */
  input: Record<string, unknown>
  /**
   * Identifies "the same work". If an active job of this type already has this key, that job is returned
   * instead of creating a duplicate (e.g. a double-clicked Generate button).
   */
  dedupeKey?: string
}

export interface EnqueueResult {
  jobId: string
  /** True when an existing active job was returned. */
  deduped: boolean
}

/** Creates a job row and starts it. Returns immediately; callers respond 202 { jobId }. */
export async function enqueueJob(params: EnqueueParams): Promise<EnqueueResult> {
  const service = createServiceClient()
  const input = params.dedupeKey ? { ...params.input, dedupeKey: params.dedupeKey } : params.input

  if (params.dedupeKey) {
    const { data, error } = await service
      .from('jobs')
      .select('id')
      .eq('user_id', params.userId)
      .eq('type', params.type)
      .in('status', ACTIVE_STATUSES)
      .contains('input', { dedupeKey: params.dedupeKey })
      .limit(1)
      .maybeSingle()
    if (error) throw new AppError('INTERNAL', { cause: error })
    if (data) return { jobId: (data as { id: string }).id, deduped: true }
  }

  const { count, error: countError } = await service
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', params.userId)
    .in('status', ACTIVE_STATUSES)
  if (countError) throw new AppError('INTERNAL', { cause: countError })
  if ((count ?? 0) >= maxConcurrentPerUser()) {
    throw new AppError('RATE_LIMITED', {
      message: 'Please wait for your current task to finish.',
      details: { retryAfterSeconds: 10 },
    })
  }

  const { data, error } = await service
    .from('jobs')
    .insert({ user_id: params.userId, child_id: params.childId, type: params.type, input })
    .select('id')
    .single()
  if (error) throw new AppError('INTERNAL', { cause: error })

  const jobId = (data as { id: string }).id
  await triggerJob(jobId)
  return { jobId, deduped: false }
}
