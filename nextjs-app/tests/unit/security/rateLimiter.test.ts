import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '@/lib/errors/app-error'

const rpc = vi.fn()
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ rpc }) }))

const { aiRouteLimits, checkRateLimit, emailSubject, enforceRateLimits, RATE_LIMITS } = await import(
  '@/lib/security/rateLimiter'
)

const log = { warn: vi.fn(), error: vi.fn() } as never

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise
    return null
  } catch (error) {
    return error instanceof AppError ? error.code : 'NOT_APP_ERROR'
  }
}

describe('rateLimiter', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  it('allows the request when the window has room', async () => {
    rpc.mockResolvedValue({ data: 0, error: null })
    await expect(checkRateLimit('user:1', RATE_LIMITS.aiHourly, log)).resolves.toBeUndefined()
    expect(rpc).toHaveBeenCalledWith('rate_limit_check', {
      p_subject: 'user:1',
      p_action: 'ai.hourly',
      p_window_seconds: 3600,
      p_max: 20,
    })
  })

  it('throws RATE_LIMITED with the exact retry-after when the window is full', async () => {
    rpc.mockResolvedValue({ data: 42, error: null })
    try {
      await checkRateLimit('user:1', RATE_LIMITS.aiHourly, log)
      expect.unreachable()
    } catch (error) {
      expect((error as AppError).code).toBe('RATE_LIMITED')
      expect((error as AppError).details).toEqual({ retryAfterSeconds: 42 })
    }
  })

  it('fails closed for protected buckets when the limiter is down', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('db down') })
    expect(await codeOf(checkRateLimit('ip:x', RATE_LIMITS.auth, log))).toBe('SERVICE_UNAVAILABLE')
  })

  it('fails open for ordinary buckets when the limiter is down', async () => {
    rpc.mockRejectedValue(new Error('db down'))
    expect(await codeOf(checkRateLimit('user:1', { action: 'me.get', windowSeconds: 60, max: 120 }, log))).toBeNull()
  })

  it('buckets auth by IP even for a signed-in user, and AI by user', async () => {
    rpc.mockResolvedValue({ data: 0, error: null })
    await enforceRateLimits([RATE_LIMITS.auth, ...aiRouteLimits('worksheets.start')], { user: 'user:1', ip: 'ip:abc' }, log)
    expect(rpc.mock.calls.map(([, args]) => [args.p_subject, args.p_action])).toEqual([
      ['ip:abc', 'auth'],
      ['user:1', 'worksheets.start'],
      ['user:1', 'worksheets.start.hourly'],
      ['user:1', 'ai.hourly'],
    ])
  })

  it('pseudonymises emails case-insensitively', () => {
    expect(emailSubject('Parent@Example.com ')).toBe(emailSubject('parent@example.com'))
    expect(emailSubject('parent@example.com')).not.toContain('example')
  })
})
