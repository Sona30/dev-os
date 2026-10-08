// Shared by server, Netlify functions and the browser: the shape of a job (docs/specs/04-jobs-framework.md).

export const JOB_TYPES = [
  'parse_report',
  'diagnose',
  'generate_worksheet',
  'rerender_pdf',
  'grade_sheet',
  'recalibrate',
  'delete_child',
] as const

export type JobType = (typeof JOB_TYPES)[number]
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export interface JobProgressState {
  step: string
  percent: number
}

export interface JobErrorDto {
  code: string
  message: string
  /** True when trying again can help (and fewer than 3 attempts were used). */
  retryable: boolean
}

export interface JobDto {
  id: string
  type: JobType
  status: JobStatus
  progress: JobProgressState
  result: Record<string, unknown> | null
  error: JobErrorDto | null
  attempts: number
  createdAt: string
  startedAt: string | null
}

export const TERMINAL_STATUSES: readonly JobStatus[] = ['succeeded', 'failed']
