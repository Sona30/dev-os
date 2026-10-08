import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors/app-error'
import { validateFileUpload } from '@/lib/security/inputValidator'

function codeOf(fn: () => unknown): string | null {
  try {
    fn()
    return null
  } catch (error) {
    return error instanceof AppError ? error.code : 'NOT_APP_ERROR'
  }
}

const MB = 1024 * 1024

describe('validateFileUpload', () => {
  it.each([
    ['report-page-1.png', 'image/png'],
    ['IMG_0001.JPG', 'image/jpeg'],
    ['photo.jpeg', 'image/jpeg'],
    ['scan.webp', 'image/webp'],
    ['IMG_2.HEIC', 'image/heic'],
  ])('accepts %s (%s)', (name, mime) => {
    expect(codeOf(() => validateFileUpload({ name, mime, bytes: 2 * MB }))).toBeNull()
  })

  it.each(['run.exe', 'x.js', 'x.mjs', 'x.cjs', 'x.php', 'x.zip', 'x.sh', 'x.bat', 'x.cmd', 'x.py', 'x.rb', 'x.ps1', 'x.svg', 'x.html'])(
    'blocks %s even when it claims to be a PNG',
    (name) => {
      expect(codeOf(() => validateFileUpload({ name, mime: 'image/png', bytes: 1000 }))).toBe('UNSUPPORTED_MEDIA')
    },
  )

  it('blocks a disguised double extension', () => {
    expect(codeOf(() => validateFileUpload({ name: 'invoice.php.png', mime: 'image/png', bytes: 1000 }))).toBe(
      'UNSUPPORTED_MEDIA',
    )
  })

  it('rejects a file with no extension', () => {
    expect(codeOf(() => validateFileUpload({ name: 'photo', mime: 'image/png', bytes: 1000 }))).toBe('UNSUPPORTED_MEDIA')
  })

  it('rejects a MIME type that is not an allowed image', () => {
    expect(codeOf(() => validateFileUpload({ name: 'a.png', mime: 'application/pdf', bytes: 1000 }))).toBe(
      'UNSUPPORTED_MEDIA',
    )
  })

  it('rejects an extension that disagrees with the MIME type', () => {
    expect(codeOf(() => validateFileUpload({ name: 'a.png', mime: 'image/jpeg', bytes: 1000 }))).toBe('UNSUPPORTED_MEDIA')
  })

  it('enforces the 10 MB limit', () => {
    expect(codeOf(() => validateFileUpload({ name: 'a.png', mime: 'image/png', bytes: 10 * MB }))).toBeNull()
    expect(codeOf(() => validateFileUpload({ name: 'a.png', mime: 'image/png', bytes: 10 * MB + 1 }))).toBe('FILE_TOO_LARGE')
  })

  it('checks the extension before the size', () => {
    expect(codeOf(() => validateFileUpload({ name: 'a.exe', mime: 'image/png', bytes: 50 * MB }))).toBe('UNSUPPORTED_MEDIA')
  })
})
