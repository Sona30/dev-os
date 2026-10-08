import { IMAGE_LONG_EDGE_PX, MAX_UPLOAD_BYTES } from '@/lib/constants'
import { analyzeGrey, qualityIssues, qualityScore, type QualityIssue } from '@/lib/images/metrics'
import { ImageProcessingError } from './errors'

// Decode → downscale → re-encode. Re-encoding drops EXIF (including GPS location) from photos (docs/specs/03 §4).

const ANALYSIS_SIZE = 512

export interface PrecheckResult {
  ok: boolean
  issues: QualityIssue[]
  score: number
}

export interface ProcessedImage {
  blob: Blob
  width: number
  height: number
  precheck: PrecheckResult | null
}

export type PreferredFormat = 'png' | 'jpeg'

interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

async function decodeImage(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
    } catch {
      // fall through to the <img> decoder
    }
  }
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    await image.decode()
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    }
  } catch {
    URL.revokeObjectURL(url)
    throw new ImageProcessingError('IMAGE_UNREADABLE')
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * Encodes a canvas within the upload size limit. PNG first when preferred (crisp report pages),
 * then progressively stronger JPEG compression.
 */
export async function encodeCanvas(canvas: HTMLCanvasElement, prefer: PreferredFormat): Promise<Blob> {
  const attempts: Array<[string, number | undefined]> =
    prefer === 'png'
      ? [['image/png', undefined], ['image/jpeg', 0.85], ['image/jpeg', 0.7]]
      : [['image/jpeg', 0.85], ['image/jpeg', 0.7], ['image/jpeg', 0.55]]

  for (const [type, quality] of attempts) {
    const blob = await canvasToBlob(canvas, type, quality)
    if (blob && blob.type === type && blob.size <= MAX_UPLOAD_BYTES) return blob
  }
  throw new ImageProcessingError('FILE_TOO_LARGE')
}

export function scaleToLongEdge(width: number, height: number, longEdge = IMAGE_LONG_EDGE_PX) {
  const scale = Math.min(1, longEdge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

function runPrecheck(source: CanvasImageSource, width: number, height: number): PrecheckResult {
  const { width: w, height: h } = scaleToLongEdge(width, height, ANALYSIS_SIZE)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return { ok: true, issues: [], score: 1 }
  context.drawImage(source, 0, 0, w, h)
  const { data } = context.getImageData(0, 0, w, h)

  const grey = new Uint8Array(w * h)
  for (let i = 0, p = 0; i < grey.length; i++, p += 4) {
    // Rec. 601 luma
    grey[i] = Math.round(0.299 * (data[p] ?? 0) + 0.587 * (data[p + 1] ?? 0) + 0.114 * (data[p + 2] ?? 0))
  }
  const metrics = analyzeGrey(grey, w, h)
  const smallerSide = Math.min(width, height)
  const issues = qualityIssues(metrics, smallerSide)
  return { ok: issues.length === 0, issues, score: qualityScore(metrics, smallerSide) }
}

/**
 * Decodes an image blob, shrinks it so the long edge is at most 2000 px, re-encodes it, and optionally
 * runs the blur/brightness/size pre-check used for photos of completed worksheets.
 */
export async function processImage(
  input: Blob,
  options: { prefer: PreferredFormat; precheck: boolean },
): Promise<ProcessedImage> {
  const decoded = await decodeImage(input)
  try {
    const { width, height } = scaleToLongEdge(decoded.width, decoded.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new ImageProcessingError('IMAGE_UNREADABLE')
    context.drawImage(decoded.source, 0, 0, width, height)

    const blob = await encodeCanvas(canvas, options.prefer)
    const precheck = options.precheck ? runPrecheck(canvas, width, height) : null
    return { blob, width, height, precheck }
  } finally {
    decoded.release()
  }
}
