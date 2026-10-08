import { ALLOWED_IMAGE_MIME } from '@/lib/constants'
import { AppError } from '@/lib/errors/app-error'
import { assertFileSize } from './tokenLimiter'

// Upload validation plus a single import point for every request schema.
//
// Every API route validates its params, query and JSON body with these Zod schemas through lib/api/route.ts
// before any business logic runs; invalid requests get 422 VALIDATION_ERROR.
//
// Files: the browser converts PDFs and HEIC photos to PNG/JPEG before upload, so the server only ever accepts
// images. The declared type is checked here when the upload is signed; the real bytes are checked again
// (magic-number sniffing) in completeUpload() before anything reads them.

export * from '@/lib/schemas/auth'
export * from '@/lib/schemas/child-profile'
export * from '@/lib/schemas/children'
export * from '@/lib/schemas/common'
export * from '@/lib/schemas/events'
export * from '@/lib/schemas/feedback'
export * from '@/lib/schemas/grading'
export * from '@/lib/schemas/reports'
export * from '@/lib/schemas/uploads'
export * from '@/lib/schemas/worksheets'

/** Executables, scripts and archives: refused whatever MIME type they claim. */
export const BLOCKED_EXTENSIONS = [
  'exe', 'dll', 'msi', 'com', 'scr',
  'js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx', 'wasm',
  'php', 'phtml', 'py', 'rb', 'pl', 'cgi', 'jar', 'war',
  'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1', 'vbs',
  'zip', 'rar', '7z', 'tar', 'gz', 'tgz',
  'html', 'htm', 'xhtml', 'svg', 'xml',
] as const

/** Extensions the upload pipeline produces or accepts, mapped to the MIME types each may carry. */
export const ALLOWED_EXTENSIONS: Record<string, readonly string[]> = {
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  webp: ['image/webp'],
  gif: ['image/gif'],
  heic: ['image/heic', 'image/heif'],
  heif: ['image/heic', 'image/heif'],
}

export interface FileDescriptor {
  name: string
  mime: string
  bytes: number
}

function extensionOf(name: string): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim())
  return match ? match[1]!.toLowerCase() : null
}

/**
 * Validates one file before an upload slot is issued, in this order:
 *   1. extension — blocklist first, then allowlist
 *   2. MIME type — must be an allowed image type and agree with the extension
 *   3. size — at most 10 MB
 * Throws 415 UNSUPPORTED_MEDIA or 413 FILE_TOO_LARGE.
 */
export function validateFileUpload(file: FileDescriptor): void {
  const extension = extensionOf(file.name)
  const segments = file.name.toLowerCase().split('.').slice(1)
  if (segments.some((segment) => (BLOCKED_EXTENSIONS as readonly string[]).includes(segment))) {
    throw new AppError('UNSUPPORTED_MEDIA')
  }
  if (!extension || !(extension in ALLOWED_EXTENSIONS)) throw new AppError('UNSUPPORTED_MEDIA')

  if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(file.mime)) throw new AppError('UNSUPPORTED_MEDIA')
  if (!ALLOWED_EXTENSIONS[extension]!.includes(file.mime)) throw new AppError('UNSUPPORTED_MEDIA')

  assertFileSize(file.bytes)
}
