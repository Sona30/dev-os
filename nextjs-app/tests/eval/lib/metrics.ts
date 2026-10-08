// Pure statistics used by the evaluation suites (docs/specs/15 §4). No I/O, so they are unit-tested.

export function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))] ?? null
}

export function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length
}

export interface CalibrationPoint {
  /** The confidence the model reported, 0-1. */
  confidence: number
  /** Whether the extraction was actually right. */
  correct: boolean
}

export interface ReliabilityBin {
  from: number
  to: number
  count: number
  meanConfidence: number | null
  accuracy: number | null
}

/** Reliability curve with equal-width bins (E8). The last bin includes 1.0. */
export function reliabilityBins(points: CalibrationPoint[], binCount = 10): ReliabilityBin[] {
  return Array.from({ length: binCount }, (_, index) => {
    const from = index / binCount
    const to = (index + 1) / binCount
    const inBin = points.filter(
      (point) => point.confidence >= from && (index === binCount - 1 ? point.confidence <= to : point.confidence < to),
    )
    return {
      from,
      to,
      count: inBin.length,
      meanConfidence: mean(inBin.map((point) => point.confidence)),
      accuracy: ratio(inBin.filter((point) => point.correct).length, inBin.length),
    }
  })
}

/** Expected calibration error: the weighted gap between confidence and accuracy across bins (E8). */
export function expectedCalibrationError(points: CalibrationPoint[], binCount = 10): number | null {
  if (points.length === 0) return null
  return reliabilityBins(points, binCount).reduce((total, bin) => {
    if (bin.count === 0 || bin.meanConfidence === null || bin.accuracy === null) return total
    return total + (bin.count / points.length) * Math.abs(bin.meanConfidence - bin.accuracy)
  }, 0)
}

export interface SegmentedResult {
  /** Segment tags such as { handwriting: 'messy', lighting: 'dim' }. */
  segments: Record<string, string>
  correct: boolean
}

export interface SegmentCut {
  dimension: string
  value: string
  n: number
  accuracy: number
  /** Points below the overall accuracy (positive = worse than overall). */
  gapBelowOverall: number
}

/** Accuracy for every tag value (E14). Segments with fewer than `minSamples` results are left out as too small to judge. */
export function segmentCuts(results: SegmentedResult[], minSamples = 10): SegmentCut[] {
  const overall = ratio(results.filter((result) => result.correct).length, results.length)
  if (overall === null) return []
  const groups = new Map<string, SegmentedResult[]>()
  for (const result of results) {
    for (const [dimension, value] of Object.entries(result.segments)) {
      const key = `${dimension}\u0000${value}`
      groups.set(key, [...(groups.get(key) ?? []), result])
    }
  }
  const cuts: SegmentCut[] = []
  for (const [key, members] of Array.from(groups.entries())) {
    if (members.length < minSamples) continue
    const [dimension = '', value = ''] = key.split('\u0000')
    const accuracy = members.filter((member) => member.correct).length / members.length
    cuts.push({ dimension, value, n: members.length, accuracy, gapBelowOverall: overall - accuracy })
  }
  return cuts.sort((a, b) => b.gapBelowOverall - a.gapBelowOverall)
}

/** Small seeded generator so synthetic profiles are reproducible (mulberry32). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
