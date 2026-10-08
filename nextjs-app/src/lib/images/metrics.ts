// Image-quality metrics shared by the browser pre-check and the server gate (docs/specs/03 §4-5).
// Pure functions over a greyscale buffer (values 0-255, row-major) so both sides score identically.

export interface GreyMetrics {
  /** Variance of the Laplacian: low means blurry. */
  blurVariance: number
  /** Mean brightness, 0-255. */
  meanLuma: number
  /** Share of interior pixels with a strong edge; near zero means a blank page. */
  edgeDensity: number
}

export type QualityIssue = 'blurry' | 'dark' | 'bright' | 'cropped' | 'blank'

export const QUALITY_THRESHOLDS = {
  /** Below this Laplacian variance a photo is blurry. */
  blurVariance: 60,
  /** Variance at which the blur score reaches 1. */
  blurVarianceGood: 120,
  darkLuma: 70,
  brightLuma: 235,
  /** Width or height below this (after downscaling) means the page is too small or cut off. */
  minDimension: 800,
  /** Edge density below this means almost nothing is on the page. */
  blankEdgeDensity: 0.002,
  edgeDensityGood: 0.005,
  edgeStrength: 20,
  /** The server refuses to grade a sheet scoring below this. */
  hardFailScore: 0.35,
} as const

export function analyzeGrey(grey: ArrayLike<number>, width: number, height: number): GreyMetrics {
  let sum = 0
  for (let i = 0; i < grey.length; i++) sum += grey[i] ?? 0
  const meanLuma = grey.length > 0 ? sum / grey.length : 0

  if (width < 3 || height < 3) return { blurVariance: 0, meanLuma, edgeDensity: 0 }

  let lapSum = 0
  let lapSumSquares = 0
  let strongEdges = 0
  let count = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x
      const laplacian =
        4 * (grey[index] ?? 0) -
        (grey[index - 1] ?? 0) -
        (grey[index + 1] ?? 0) -
        (grey[index - width] ?? 0) -
        (grey[index + width] ?? 0)
      lapSum += laplacian
      lapSumSquares += laplacian * laplacian
      if (Math.abs(laplacian) > QUALITY_THRESHOLDS.edgeStrength) strongEdges++
      count++
    }
  }
  const mean = lapSum / count
  return {
    blurVariance: lapSumSquares / count - mean * mean,
    meanLuma,
    edgeDensity: strongEdges / count,
  }
}

export function qualityIssues(metrics: GreyMetrics, minDimension: number): QualityIssue[] {
  const t = QUALITY_THRESHOLDS
  const issues: QualityIssue[] = []
  if (metrics.edgeDensity < t.blankEdgeDensity) issues.push('blank')
  else if (metrics.blurVariance < t.blurVariance) issues.push('blurry')
  if (metrics.meanLuma < t.darkLuma) issues.push('dark')
  if (metrics.meanLuma > t.brightLuma) issues.push('bright')
  if (minDimension < t.minDimension) issues.push('cropped')
  return issues
}

/** 0-1 score: the weakest of blur, brightness, content and size. */
export function qualityScore(metrics: GreyMetrics, minDimension: number): number {
  const t = QUALITY_THRESHOLDS
  const blur = Math.min(1, metrics.blurVariance / t.blurVarianceGood)
  const luma =
    metrics.meanLuma >= t.darkLuma && metrics.meanLuma <= t.brightLuma
      ? 1
      : Math.max(0, 1 - (metrics.meanLuma < t.darkLuma ? t.darkLuma - metrics.meanLuma : metrics.meanLuma - t.brightLuma) / t.darkLuma)
  const content = Math.min(1, metrics.edgeDensity / t.edgeDensityGood)
  const size = Math.min(1, minDimension / t.minDimension)
  return Math.round(Math.min(blur, luma, content, size) * 1000) / 1000
}
