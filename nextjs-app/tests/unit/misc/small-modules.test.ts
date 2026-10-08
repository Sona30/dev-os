import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FREE_CYCLES, PLANS } from '@/lib/entitlements/plans'
import { signJobId, verifyJobSignature } from '@/lib/jobs/sign'
import { deriveReadingBand } from '@/lib/reading/derive-reading-band'
import { buildUploadPath, extensionFor } from '@/lib/uploads/paths'
import { cropRegion, fallbackBox } from '@/lib/grading/crops'

describe('job signing (X: only signed calls may run a job)', () => {
  const original = process.env.JOB_SIGNING_SECRET
  beforeEach(() => {
    process.env.JOB_SIGNING_SECRET = 'a'.repeat(32)
  })
  afterEach(() => {
    if (original === undefined) delete process.env.JOB_SIGNING_SECRET
    else process.env.JOB_SIGNING_SECRET = original
  })

  it('verifies its own signature', () => {
    const signature = signJobId('job-1')
    expect(verifyJobSignature('job-1', signature)).toBe(true)
  })
  it('rejects a signature for a different job, a wrong length, or none', () => {
    const signature = signJobId('job-1')
    expect(verifyJobSignature('job-2', signature)).toBe(false)
    expect(verifyJobSignature('job-1', 'abc')).toBe(false)
    expect(verifyJobSignature('job-1', null)).toBe(false)
  })
  it('refuses to run with a short or missing secret', () => {
    process.env.JOB_SIGNING_SECRET = 'short'
    expect(() => signJobId('job-1')).toThrow()
  })
})

describe('deriveReadingBand', () => {
  it('maps a measured Lexile to a band and marks it measured', () => {
    expect(deriveReadingBand(1, 150)).toEqual({ band: 'R1', estimated: false })
    expect(deriveReadingBand(1, 200)).toEqual({ band: 'R2', estimated: false })
    expect(deriveReadingBand(2, 399)).toEqual({ band: 'R2', estimated: false })
    expect(deriveReadingBand(2, 400)).toEqual({ band: 'R3', estimated: false })
    expect(deriveReadingBand(2, 1200)).toEqual({ band: 'R4', estimated: false })
  })
  it('starts one band below the grade default without a Lexile, and says it is an estimate', () => {
    expect(deriveReadingBand(1, null)).toEqual({ band: 'R1', estimated: true })
    expect(deriveReadingBand(2, null)).toEqual({ band: 'R2', estimated: true })
  })
})

describe('upload paths', () => {
  it('starts with the owner id, which the storage policies match against', () => {
    const path = buildUploadPath({ userId: 'u1', childId: 'c1', kind: 'completed_sheet', uploadId: 'up1', mime: 'image/jpeg' })
    expect(path).toBe('u1/c1/completed_sheet/up1.jpg')
  })
  it('maps mime types to extensions', () => {
    expect(extensionFor('image/heif')).toBe('heic')
    expect(extensionFor('application/x-evil')).toBe('bin')
  })
})

describe('plans', () => {
  it('has one free cycle, and a free plan first', () => {
    expect(FREE_CYCLES).toBe(1)
    expect(PLANS[0]?.tier).toBe('free')
  })
  it('does not sell the tutor plan yet', () => {
    expect(PLANS.find((plan) => plan.tier === 'tutor')?.comingLater).toBe(true)
  })
  it('has unique tiers', () => {
    expect(new Set(PLANS.map((plan) => plan.tier)).size).toBe(PLANS.length)
  })
})

describe('crop geometry', () => {
  it('pads the box and stays inside the image', () => {
    const region = cropRegion({ x: 0.9, y: 0.9, w: 0.2, h: 0.2 }, 1000, 1000)
    expect(region.left + region.width).toBeLessThanOrEqual(1000)
    expect(region.top + region.height).toBeLessThanOrEqual(1000)
  })
  it('never returns a crop smaller than the minimum', () => {
    const region = cropRegion({ x: 0.5, y: 0.5, w: 0.001, h: 0.001 }, 1000, 1000)
    expect(region.width).toBeGreaterThanOrEqual(24)
    expect(region.height).toBeGreaterThanOrEqual(24)
  })
  it('falls back to the strip where the question normally sits', () => {
    const box = fallbackBox(2, 10)
    expect(box.y).toBeCloseTo(0.1)
    expect(box.w).toBe(1)
    expect(box.y + box.h).toBeLessThanOrEqual(1.1)
  })
})
