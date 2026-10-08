import type { SupabaseClient } from '@supabase/supabase-js'
import { percentForStep } from './steps'
import type { JobType } from './types'

const MIN_INTERVAL_MS = 1000

/** Returns a progress reporter that persists changes without hammering the database. */
export function createProgressReporter(service: SupabaseClient, jobId: string, type: JobType) {
  let lastStep = ''
  let lastWriteAt = 0

  return async function setProgress(step: string): Promise<void> {
    const now = Date.now()
    const stepChanged = step !== lastStep
    if (!stepChanged && now - lastWriteAt < MIN_INTERVAL_MS) return

    lastStep = step
    lastWriteAt = now
    const { error } = await service
      .from('jobs')
      .update({ progress: { step, percent: percentForStep(type, step) } })
      .eq('id', jobId)
    // Progress is cosmetic: a failed write must never fail the job.
    if (error) console.error('job progress write failed', error.message)
  }
}
