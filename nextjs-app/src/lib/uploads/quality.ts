import 'server-only'
import sharp from 'sharp'
import { analyzeGrey, qualityScore } from '@/lib/images/metrics'

const ANALYSIS_SIZE = 512

/**
 * Scores a photo from 0 (unusable) to 1 (clear) using the same metrics as the browser pre-check.
 * HEIC cannot be decoded here (the browser always converts it first), so callers skip it.
 */
export async function computeQualityScore(buffer: Buffer): Promise<number> {
  const original = await sharp(buffer).metadata()
  const { data, info } = await sharp(buffer)
    .rotate()
    .greyscale()
    .resize({ width: ANALYSIS_SIZE, height: ANALYSIS_SIZE, fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true })

  const metrics = analyzeGrey(data, info.width, info.height)
  // The smaller side is the same whichever way EXIF rotates the image, so no orientation handling is needed.
  const smallerSide = Math.min(original.width ?? info.width, original.height ?? info.height)
  return qualityScore(metrics, smallerSide)
}
