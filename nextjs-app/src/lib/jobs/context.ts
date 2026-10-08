import type { SupabaseClient } from '@supabase/supabase-js'
import type { Logger } from '@/lib/logger'
import type { JobStatus, JobType } from './types'

export interface JobRow {
  id: string
  user_id: string
  child_id: string | null
  type: JobType
  status: JobStatus
  input: Record<string, unknown>
  result: Record<string, unknown> | null
  error_code: string | null
  error_message: string | null
  attempts: number
  started_at: string | null
  finished_at: string | null
  created_at: string
  progress: { step: string; percent: number }
}

/** What every runner receives. Runners use the service client but only for the job's own user (job.user_id). */
export interface JobContext {
  job: JobRow
  service: SupabaseClient
  log: Logger
  /** Reports a step; writes are throttled to one per second unless the step changes. */
  setProgress: (step: string) => Promise<void>
  /** Throws ChildDeletedError if the job's child no longer exists. Call at each step boundary. */
  assertChildExists: () => Promise<void>
}

/** A runner returns the job's `result` object. It must be idempotent (docs/specs/04 §5). */
export type JobRunner = (context: JobContext) => Promise<Record<string, unknown>>
