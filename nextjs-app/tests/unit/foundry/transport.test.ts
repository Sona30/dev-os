import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { extractJson } from '@/lib/foundry/json-extract'
import { backoffDelay, ContentBlockedError, TransientFoundryError, withTransportRetry } from '@/lib/foundry/retry'
import { generateOutput, gradeOutput, parseOutput } from '@/lib/foundry/schemas/outputs'

describe('extractJson', () => {
  it('reads a fenced json block and returns the write-up before it', () => {
    const result = extractJson('Here is the result.\n```json\n{"a":1}\n```')
    expect(result?.json).toEqual({ a: 1 })
    expect(result?.narrative).toBe('Here is the result.')
  })
  it('falls back to the first balanced object, ignoring braces inside strings', () => {
    const result = extractJson('Result: {"a":{"b":"}"}} done')
    expect(result?.json).toEqual({ a: { b: '}' } })
  })
  it('returns null for invalid or missing json', () => {
    expect(extractJson('```json\n{oops}\n```')).toBeNull()
    expect(extractJson('no json here')).toBeNull()
  })
})

describe('withTransportRetry', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('retries transient failures and then succeeds', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new TransientFoundryError('busy'))
      .mockRejectedValueOnce(new TransientFoundryError('busy'))
      .mockResolvedValue('ok')
    const promise = withTransportRetry(operation)
    await vi.runAllTimersAsync()
    await expect(promise).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(3)
  })

  it('gives up after three attempts', async () => {
    const operation = vi.fn<() => Promise<string>>().mockRejectedValue(new TransientFoundryError('busy'))
    const assertion = expect(withTransportRetry(operation)).rejects.toBeInstanceOf(TransientFoundryError)
    await vi.runAllTimersAsync()
    await assertion
    expect(operation).toHaveBeenCalledTimes(3)
  })

  it('does not retry a blocked-content error', async () => {
    const operation = vi.fn<() => Promise<string>>().mockRejectedValue(new ContentBlockedError('blocked'))
    await expect(withTransportRetry(operation)).rejects.toBeInstanceOf(ContentBlockedError)
    expect(operation).toHaveBeenCalledTimes(1)
  })
})

describe('backoffDelay', () => {
  it('grows with each attempt and honours Retry-After', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    expect(backoffDelay(0)).toBe(1000)
    expect(backoffDelay(1)).toBe(3000)
    expect(backoffDelay(5)).toBe(8000)
    expect(backoffDelay(0, 20_000)).toBe(20_000)
    random.mockRestore()
  })
})

describe('output schemas', () => {
  it('rejects a generate response with no items', () => {
    expect(generateOutput.safeParse({ items: [], flags: [] }).success).toBe(false)
  })
  it('rejects more than ten items', () => {
    const item = {
      position: 1, skillId: 'G1.NO.02', domain: 'd', mathLevel: 2, readingBand: 'R1', pairId: null, isStretch: false,
      isReadingProbe: false, structure: 's', context: 'c', numberSet: [1], questionText: 'q?', answerType: 'integer',
      correctAnswer: '1', acceptedAnswers: [], working: 'w',
      verification: { expression: '1', expected: '1', passed: true, method: 'code_interpreter' }, ambiguous: false,
    }
    expect(generateOutput.safeParse({ items: Array(11).fill(item), flags: [] }).success).toBe(false)
  })
  it('rejects a parse response with an unknown status', () => {
    expect(parseOutput.safeParse({ status: 'maybe' }).success).toBe(false)
  })
  it('rejects grade confidences outside 0-1', () => {
    const result = gradeOutput.safeParse({
      sheetId: null,
      sheetIdConfidence: 1.5,
      qualityAssessment: 'good',
      items: [],
      flags: [],
    })
    expect(result.success).toBe(false)
  })
})
