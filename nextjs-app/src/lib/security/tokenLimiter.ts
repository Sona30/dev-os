import { AppError } from '@/lib/errors/app-error'
import { MAX_REPORT_PAGES, MAX_SHEET_PAGES, MAX_UPLOAD_BYTES } from '@/lib/constants'

// Size and usage ceilings for everything that costs storage or AI tokens. Business limits (pages per report,
// items per sheet) live in lib/constants.ts; this module re-exports them next to the security-only ceilings
// and provides the validators that enforce them.

/** Per-file upload ceiling: 10 MB, identical to the `uploads` bucket's file_size_limit. */
export const MAX_FILE_BYTES = MAX_UPLOAD_BYTES

/** Page/photo ceilings per upload batch, by kind. */
export const MAX_PAGES = { report_page: MAX_REPORT_PAGES, completed_sheet: MAX_SHEET_PAGES } as const

/** Absolute ceiling for any single piece of parent-typed text bound for the AI (fields are usually far shorter). */
export const MAX_USER_TEXT_LENGTH = 5000

/**
 * Ceiling on the serialised JSON input of one AI call (~25k tokens). Real inputs are a few thousand
 * characters; anything near this means a bug or tampered data, and is refused before tokens are spent.
 */
export const MAX_AGENT_INPUT_CHARS = 100_000

export function assertFileSize(bytes: number): void {
  if (!Number.isFinite(bytes) || bytes <= 0) throw new AppError('VALIDATION_ERROR', { message: 'That file is empty.' })
  if (bytes > MAX_FILE_BYTES) throw new AppError('FILE_TOO_LARGE')
}

export function assertPageCount(kind: keyof typeof MAX_PAGES, count: number): void {
  const max = MAX_PAGES[kind]
  if (count > max) {
    throw new AppError('VALIDATION_ERROR', {
      message: `You can upload up to ${max} ${kind === 'report_page' ? 'report pages' : 'photos'} at a time.`,
    })
  }
}

export function assertTextLength(text: string, max = MAX_USER_TEXT_LENGTH, field = 'text'): void {
  if (text.length > max) {
    throw new AppError('VALIDATION_ERROR', {
      details: { fieldErrors: { [field]: [`Please use ${max} characters or fewer`] } },
    })
  }
}

/** Refuses an AI call whose input is implausibly large (cost protection). */
export function assertAgentInputSize(input: unknown): void {
  const size = JSON.stringify(input ?? null).length
  if (size > MAX_AGENT_INPUT_CHARS) {
    throw new AppError('INTERNAL', { cause: new Error(`agent input is ${size} chars (limit ${MAX_AGENT_INPUT_CHARS})`) })
  }
}
