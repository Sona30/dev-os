import { getLogger } from '@/lib/logger'
import { triggerJob } from '@/lib/jobs/trigger'
import { createServiceClient } from '@/lib/supabase/service'

// Scheduled every 5 minutes (docs/specs/04 §6): keeps the queue honest.
//   1. Jobs stuck "running" past the limit are failed (TIMEOUT) so the parent can retry.
//   2. Jobs stuck "queued" (their trigger failed) are started again.
//   3. Old finished jobs are deleted: delete_child records after 7 days, everything else after 90 days.

export const config = { schedule: '*/5 * * * *' }

const DAY_MS = 24 * 60 * 60 * 1000

function maxRuntimeMinutes(): number {
  const configured = Number(process.env.JOB_MAX_RUNTIME_MINUTES)
  return Number.isFinite(configured) && configured > 0 ? configured : 10
}

export default async function handler(): Promise<Response> {
  const log = getLogger({ route: 'reap-stale-jobs' })
  const service = createServiceClient()
  const now = Date.now()

  const staleBefore = new Date(now - maxRuntimeMinutes() * 60_000).toISOString()
  const { data: timedOut, error: timeoutError } = await service
    .from('jobs')
    .update({
      status: 'failed',
      error_code: 'TIMEOUT',
      error_message: 'This took longer than expected. Please try again.',
      finished_at: new Date(now).toISOString(),
    })
    .eq('status', 'running')
    .lt('started_at', staleBefore)
    .select('id')
  if (timeoutError) log.error({ err: timeoutError }, 'could not fail stale running jobs')

  const queuedBefore = new Date(now - 2 * 60_000).toISOString()
  const { data: stuck, error: stuckError } = await service
    .from('jobs')
    .select('id')
    .eq('status', 'queued')
    .lt('attempts', 3)
    .lt('created_at', queuedBefore)
    .limit(50)
  if (stuckError) log.error({ err: stuckError }, 'could not list stuck queued jobs')
  for (const job of (stuck ?? []) as { id: string }[]) await triggerJob(job.id)

  const { error: deleteChildJobsError } = await service
    .from('jobs')
    .delete()
    .eq('type', 'delete_child')
    .in('status', ['succeeded', 'failed'])
    .lt('created_at', new Date(now - 7 * DAY_MS).toISOString())
  if (deleteChildJobsError) log.error({ err: deleteChildJobsError }, 'could not purge old delete_child jobs')

  const { error: oldJobsError } = await service
    .from('jobs')
    .delete()
    .in('status', ['succeeded', 'failed'])
    .lt('created_at', new Date(now - 90 * DAY_MS).toISOString())
  if (oldJobsError) log.error({ err: oldJobsError }, 'could not purge old jobs')

  log.info({ timedOut: timedOut?.length ?? 0, retriggered: stuck?.length ?? 0 }, 'reaper finished')
  return new Response(null, { status: 200 })
}
