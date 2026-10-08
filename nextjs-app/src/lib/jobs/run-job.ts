import { z } from 'zod'
import { AppError } from '@/lib/errors/app-error'
import { getLogger } from '@/lib/logger'
import { createServiceClient } from '@/lib/supabase/service'
import { recordUsage } from '@/lib/usage/record'
import type { JobContext, JobRow } from './context'
import { ChildDeletedError, toJobFailure } from './errors'
import { createProgressReporter } from './progress'
import { RUNNERS } from './runners'

const jobIdSchema = z.string().uuid()

/**
 * Executes one queued job to completion. Used by the Netlify background function (production)
 * and called in-process during local development. Safe to call twice: `claim_job` is atomic,
 * so only one caller ever runs the job (docs/specs/04 §3, §5).
 */
export async function runJob(rawJobId: string): Promise<void> {
  const jobId = jobIdSchema.parse(rawJobId)
  const log = getLogger({ jobId })
  const service = createServiceClient()

  const { data, error: claimError } = await service.rpc('claim_job', { p_job_id: jobId })
  if (claimError) {
    log.error({ err: claimError }, 'claim_job failed')
    return
  }
  const claimed = data as JobRow | null
  // A composite function result with no match comes back as null or as an all-null row.
  if (!claimed || !claimed.id) {
    log.info('job not claimable (already running, finished or out of attempts)')
    return
  }

  const jobLog = log.child({ type: claimed.type, attempt: claimed.attempts })
  const startedAt = Date.now()

  const context: JobContext = {
    job: claimed,
    service,
    log: jobLog,
    setProgress: createProgressReporter(service, claimed.id, claimed.type),
    assertChildExists: async () => {
      const childId = typeof claimed.input.childId === 'string' ? claimed.input.childId : claimed.child_id
      if (!childId) return
      const { data: child, error } = await service.from('children').select('id').eq('id', childId).maybeSingle()
      if (error) throw new AppError('INTERNAL', { cause: error })
      if (!child) throw new ChildDeletedError()
    },
  }

  try {
    const runner = RUNNERS[claimed.type]
    if (!runner) throw new AppError('INTERNAL', { cause: new Error(`No runner registered for job type ${claimed.type}`) })

    const result = await runner(context)

    const { error } = await service
      .from('jobs')
      .update({
        status: 'succeeded',
        result,
        error_code: null,
        error_message: null,
        progress: { step: 'done', percent: 100 },
        finished_at: new Date().toISOString(),
      })
      .eq('id', claimed.id)
    if (error) throw new AppError('INTERNAL', { cause: error })
    jobLog.info({ durationMs: Date.now() - startedAt }, 'job succeeded')
  } catch (error) {
    const failure = toJobFailure(error)
    jobLog.error({ err: error, code: failure.code, durationMs: Date.now() - startedAt }, 'job failed')
    const { error: updateError } = await service
      .from('jobs')
      .update({
        status: 'failed',
        error_code: failure.code,
        error_message: failure.message,
        finished_at: new Date().toISOString(),
      })
      .eq('id', claimed.id)
    if (updateError) jobLog.error({ err: updateError }, 'could not record job failure')
    await recordUsage({
      userId: claimed.user_id,
      childId: claimed.child_id,
      jobId: claimed.id,
      event: `job.failed:${failure.code}`,
    })
  }
}
