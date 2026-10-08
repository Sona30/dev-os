import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError } from '@/lib/errors/app-error'
import { createServiceClient } from '@/lib/supabase/service'
import type { JobRow } from './context'
import { isRetryableCode, messageForCode } from './errors'
import { triggerJob } from './trigger'
import { MAX_JOB_ATTEMPTS } from '@/lib/constants'
import type { JobDto } from './types'

const COLUMNS =
  'id, user_id, child_id, type, status, progress, input, result, error_code, error_message, attempts, started_at, finished_at, created_at'

export function toJobDto(row: JobRow): JobDto {
  const failed = row.status === 'failed'
  const code = row.error_code ?? 'INTERNAL'
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    progress: row.progress,
    result: row.result,
    error: failed
      ? {
          code,
          message: row.error_message ?? messageForCode(code),
          retryable: row.attempts < MAX_JOB_ATTEMPTS && isRetryableCode(code),
        }
      : null,
    attempts: row.attempts,
    createdAt: row.created_at,
    startedAt: row.started_at,
  }
}

/** Reads a job through the user-scoped client, so only the owner can see it (RLS). */
export async function getJob(supabase: SupabaseClient, jobId: string): Promise<JobDto> {
  const { data, error } = await supabase.from('jobs').select(COLUMNS).eq('id', jobId).maybeSingle()
  if (error) throw new AppError('INTERNAL', { cause: error })
  if (!data) throw new AppError('NOT_FOUND')
  return toJobDto(data as JobRow)
}

/**
 * Re-queues a failed job. Ownership is checked first with the user client; the update itself needs the
 * service role. Runners are idempotent, so re-running is safe (docs/specs/04 §3, §5).
 */
export async function retryJob(supabase: SupabaseClient, jobId: string): Promise<JobDto> {
  const current = await getJob(supabase, jobId)
  if (current.status !== 'failed') throw new AppError('CONFLICT')
  if (current.attempts >= MAX_JOB_ATTEMPTS) throw new AppError('JOB_RETRY_LIMIT')
  if (!current.error?.retryable) throw new AppError('CONFLICT')

  const service = createServiceClient()
  const { data, error } = await service
    .from('jobs')
    .update({
      status: 'queued',
      error_code: null,
      error_message: null,
      finished_at: null,
      progress: { step: 'queued', percent: 0 },
    })
    .eq('id', jobId)
    .eq('status', 'failed') // guards against two simultaneous retries
    .select(COLUMNS)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', { cause: error })
  if (!data) throw new AppError('CONFLICT')

  await triggerJob(jobId)
  return toJobDto(data as JobRow)
}
