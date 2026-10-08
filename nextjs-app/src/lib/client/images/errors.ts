export type ImageProcessingCode =
  | 'TOO_MANY_PAGES'
  | 'PDF_LOCKED'
  | 'PDF_UNREADABLE'
  | 'HEIC_FAILED'
  | 'IMAGE_UNREADABLE'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED'
  | 'PDF_NOT_ALLOWED'

const MESSAGES: Record<ImageProcessingCode, string> = {
  TOO_MANY_PAGES: 'That PDF has more than 5 pages.',
  PDF_LOCKED: 'That PDF is password-protected. Remove the password, or enter the scores by hand instead.',
  PDF_UNREADABLE: 'We couldn’t open that PDF. Try a screenshot of the report, or enter the scores by hand.',
  HEIC_FAILED: 'We couldn’t read that photo. Try taking it again, or choose a JPEG.',
  IMAGE_UNREADABLE: 'We couldn’t read that image. Try a different file.',
  FILE_TOO_LARGE: 'That file is larger than 10 MB, even after shrinking it. Try a smaller photo.',
  UNSUPPORTED: 'We can’t read that file type. Use a photo (JPEG, PNG, WEBP, GIF or HEIC).',
  PDF_NOT_ALLOWED: 'Please add a photo of the sheet, not a PDF.',
}

/** A failure while preparing a file in the browser, with a message safe to show a parent. */
export class ImageProcessingError extends Error {
  readonly code: ImageProcessingCode
  /** For TOO_MANY_PAGES: how many pages the PDF has. */
  readonly pageCount?: number

  constructor(code: ImageProcessingCode, pageCount?: number) {
    super(MESSAGES[code])
    this.name = 'ImageProcessingError'
    this.code = code
    this.pageCount = pageCount
  }
}
