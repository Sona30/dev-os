import type { PDFDocumentProxy } from 'pdfjs-dist'
import { IMAGE_LONG_EDGE_PX, MAX_REPORT_PAGES } from '@/lib/constants'
import { ImageProcessingError } from './errors'
import { encodeCanvas } from './process-image'

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

interface PdfToImagesOptions {
  /** When a PDF has too many pages, convert only the first `maxPages` instead of failing. */
  truncate?: boolean
  maxPages?: number
}

export interface PdfPageImage {
  blob: Blob
  width: number
  height: number
  pageNumber: number
}

/**
 * Renders each PDF page to an image (long edge ≤ 2000 px) entirely in the browser, so the model only ever
 * receives images (FR-02). pdfjs loads lazily and runs its parsing in a web worker.
 */
export async function pdfToImages(file: File, options: PdfToImagesOptions = {}): Promise<PdfPageImage[]> {
  const maxPages = options.maxPages ?? MAX_REPORT_PAGES

  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString()

  const data = new Uint8Array(await file.arrayBuffer())
  let document_: PDFDocumentProxy
  try {
    // isEvalSupported: false closes CVE-2024-4367 (script execution from a crafted font in a malicious PDF)
    // on pdfjs-dist 3.x; the parent's file is rendered to images only, so nothing else is needed from eval.
    document_ = await pdfjs.getDocument({ data, isEvalSupported: false }).promise
  } catch (error) {
    const name = (error as { name?: string } | null)?.name
    throw new ImageProcessingError(name === 'PasswordException' ? 'PDF_LOCKED' : 'PDF_UNREADABLE')
  }

  try {
    const pageCount = document_.numPages
    if (pageCount > maxPages && !options.truncate) throw new ImageProcessingError('TOO_MANY_PAGES', pageCount)

    const pages: PdfPageImage[] = []
    for (let pageNumber = 1; pageNumber <= Math.min(pageCount, maxPages); pageNumber++) {
      const page = await document_.getPage(pageNumber)
      const base = page.getViewport({ scale: 1 })
      const scale = IMAGE_LONG_EDGE_PX / Math.max(base.width, base.height)
      const viewport = page.getViewport({ scale })

      const canvas = window.document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      const context = canvas.getContext('2d')
      if (!context) throw new ImageProcessingError('PDF_UNREADABLE')

      await page.render({ canvasContext: context, viewport }).promise
      const blob = await encodeCanvas(canvas, 'png')
      pages.push({ blob, width: canvas.width, height: canvas.height, pageNumber })
      page.cleanup()
    }
    return pages
  } catch (error) {
    if (error instanceof ImageProcessingError) throw error
    throw new ImageProcessingError('PDF_UNREADABLE')
  } finally {
    await document_.destroy()
  }
}
