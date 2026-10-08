import { AppError } from '@/lib/errors/app-error'
import { ERROR_CATALOG, type ErrorCode } from '@/lib/errors/codes'

// Job failure codes: the shared catalogue plus two job-only codes (docs/specs/04 §3).
export type JobErrorCode = ErrorCode | 'TIMEOUT' | 'CHILD_DELETED'

const JOB_ONLY_MESSAGES: Record<'TIMEOUT' | 'CHILD_DELETED', string> = {
  TIMEOUT: 'This took longer than expected. Please try again.',
  CHILD_DELETED: 'This profile was deleted.',
}

/** Failures where the parent must act (retake a photo, confirm values) — retrying the same job cannot help. */
const NON_RETRYABLE = new Set<string>([
  'PHOTO_QUALITY',
  'SHEET_MISMATCH',
  'CHILD_DELETED',
  'PAYWALL',
  'REPORT_NOT_CONFIRMED',
  'PROMPT_INJECTION',
])

export function isRetryableCode(code: string): boolean {
  return !NON_RETRYABLE.has(code)
}

export function messageForCode(code: string): string {
  if (code in JOB_ONLY_MESSAGES) return JOB_ONLY_MESSAGES[code as keyof typeof JOB_ONLY_MESSAGES]
  if (code in ERROR_CATALOG) return ERROR_CATALOG[code as ErrorCode].message
  return ERROR_CATALOG.INTERNAL.message
}

export interface JobFailure {
  code: JobErrorCode
  message: string
}

/** Runners throw this when the child disappears mid-job (docs/specs/04 §8). */
export class ChildDeletedError extends Error {
  constructor() {
    super('CHILD_DELETED')
    this.name = 'ChildDeletedError'
  }
}

/** Turns anything thrown inside a runner into a stored, parent-safe failure. */
export function toJobFailure(error: unknown): JobFailure {
  if (error instanceof ChildDeletedError) return { code: 'CHILD_DELETED', message: JOB_ONLY_MESSAGES.CHILD_DELETED }
  if (error instanceof AppError) return { code: error.code, message: error.userMessage }
  return { code: 'INTERNAL', message: ERROR_CATALOG.INTERNAL.message }
}
