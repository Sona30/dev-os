import { ImageProcessingError } from './errors'

/** True for iPhone photos (HEIC/HEIF), judged by MIME type or extension since some browsers leave type empty. */
export function isHeic(file: File): boolean {
  return /^image\/hei[cf]$/i.test(file.type) || /\.hei[cf]$/i.test(file.name)
}

/** Converts a HEIC/HEIF photo to JPEG in the browser. The converter (~1 MB) loads only when needed. */
export async function heicToJpeg(file: File): Promise<Blob> {
  try {
    const { default: heic2any } = await import('heic2any')
    const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 })
    const blob = Array.isArray(result) ? result[0] : result
    if (!blob) throw new Error('empty conversion')
    return blob
  } catch {
    throw new ImageProcessingError('HEIC_FAILED')
  }
}
