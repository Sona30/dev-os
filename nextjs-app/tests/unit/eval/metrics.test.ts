import { describe, expect, it } from 'vitest'
import {
  expectedCalibrationError,
  mean,
  percentile,
  ratio,
  reliabilityBins,
  seededRandom,
  segmentCuts,
} from '../../eval/lib/metrics'

describe('basic statistics', () => {
  it('handles empty input without dividing by zero', () => {
    expect(ratio(0, 0)).toBeNull()
    expect(mean([])).toBeNull()
    expect(percentile([], 95)).toBeNull()
  })
  it('computes nearest-rank percentiles', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5)
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10)
    expect(percentile([42], 95)).toBe(42)
  })
})

describe('expectedCalibrationError', () => {
  it('is 0 for a perfectly calibrated model', () => {
    const points = [
      ...Array.from({ length: 10 }, (_, i) => ({ confidence: 0.9, correct: i < 9 })),
      ...Array.from({ length: 10 }, (_, i) => ({ confidence: 0.5, correct: i < 5 })),
    ]
    expect(expectedCalibrationError(points)).toBeCloseTo(0, 5)
  })
  it('is large for an over-confident model', () => {
    const points = Array.from({ length: 10 }, (_, i) => ({ confidence: 0.95, correct: i < 5 }))
    expect(expectedCalibrationError(points)).toBeCloseTo(0.45, 5)
  })
  it('puts confidence 1.0 in the last bin', () => {
    const bins = reliabilityBins([{ confidence: 1, correct: true }])
    expect(bins[9]?.count).toBe(1)
  })
  it('returns null with no data', () => {
    expect(expectedCalibrationError([])).toBeNull()
  })
})

describe('segmentCuts', () => {
  const make = (value: string, correct: number, total: number) =>
    Array.from({ length: total }, (_, i) => ({ segments: { lighting: value }, correct: i < correct }))
  it('reports the gap below overall and orders worst first', () => {
    const cuts = segmentCuts([...make('good', 19, 20), ...make('dim', 14, 20)])
    expect(cuts[0]).toMatchObject({ dimension: 'lighting', value: 'dim', n: 20 })
    expect(cuts[0]?.gapBelowOverall).toBeCloseTo(0.825 - 0.7, 5)
  })
  it('leaves out segments that are too small to judge', () => {
    expect(segmentCuts([...make('good', 20, 20), ...make('rare', 0, 3)])).toHaveLength(1)
  })
})

describe('seededRandom', () => {
  it('is reproducible and within [0, 1)', () => {
    const a = seededRandom(7)
    const b = seededRandom(7)
    for (let i = 0; i < 20; i++) {
      const value = a()
      expect(value).toBe(b())
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})
