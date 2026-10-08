import { ALLOWED_IMAGE_MIME } from '@/lib/constants'
import { ImageProcessingError } from './errors'
import { heicToJpeg, isHeic } from './heic-to-jpeg'
import { isPdf, pdfToImages } from './pdf-to-images'
import { processImage, type PrecheckResult } from './process-image'

export type UploadKind = 'report_page' | 'completed_sheet'

export interface PreparedImage {
  file: File
  width: number
  height: number
  /** Present for completed-sheet photos only. */
  precheck: PrecheckResult | null
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '') || 'image'
}

function extensionFor(blob: Blob): string {
  return blob.type === 'image/png' ? 'png' : 'jpg'
}

function toFile(blob: Blob, name: string): File {
  return new File([blob], `${name}.${extensionFor(blob)}`, { type: blob.type })
}

function isSupportedImage(file: File): boolean {
  return (ALLOWED_IMAGE_MIME as readonly string[]).includes(file.type) || isHeic(file)
}

/**
 * Turns whatever the parent picked into upload-ready images:
 * PDFs → one image per page, HEIC → JPEG, everything → downscaled and re-encoded (EXIF stripped).
 * A report PDF can yield several images; a photo yields exactly one.
 */
export async function prepareFile(
  file: File,
  options: { kind: UploadKind; truncatePdf?: boolean },
): Promise<PreparedImage[]> {
  const { kind } = options
  const wantsPrecheck = kind === 'completed_sheet'
  const prefer = kind === 'report_page' ? 'png' : 'jpeg'

  if (isPdf(file)) {
    if (kind !== 'report_page') throw new ImageProcessingError('PDF_NOT_ALLOWED')
    const pages = await pdfToImages(file, { truncate: options.truncatePdf })
    return pages.map((page) => ({
      file: toFile(page.blob, `${baseName(file.name)}-page-${page.pageNumber}`),
      width: page.width,
      height: page.height,
      precheck: null,
    }))
  }

  if (!isSupportedImage(file)) throw new ImageProcessingError('UNSUPPORTED')

  const source = isHeic(file) ? await heicToJpeg(file) : file
  const processed = await processImage(source, { prefer, precheck: wantsPrecheck })
  return [
    {
      file: toFile(processed.blob, baseName(file.name)),
      width: processed.width,
      height: processed.height,
      precheck: processed.precheck,
    },
  ]
}
