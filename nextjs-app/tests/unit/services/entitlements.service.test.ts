import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase, type FakeTable } from '../helpers/fake-supabase'

// X6 @critical: the paywall fires from the subscription row, before anything that costs money.

const service = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => service.client }))

const { assertCanStartCycle, getEntitlements } = await import('@/lib/entitlements/entitlements.service')

const subscription = (overrides: Record<string, unknown> = {}) => ({
  plan: 'free',
  status: 'none',
  free_cycle_used: false,
  waitlist_opt_in: false,
  child_limit: 1,
  daily_cycle_cap: 3,
  current_period_end: null,
  ...overrides,
})

function setup(sub: Record<string, unknown>, cyclesCount = 0, children: FakeTable = { rows: [{ id: 'c1' }] }) {
  service.client = fakeSupabase({ children, cycles: { count: cyclesCount } })
  return fakeSupabase({ subscriptions: { rows: [sub] } })
}

describe('assertCanStartCycle', () => {
  beforeEach(() => {
    service.client = fakeSupabase({})
  })

  it('lets a free user start their one free cycle', async () => {
    await expect(assertCanStartCycle(setup(subscription()), 'u1', 'c1')).resolves.toBeUndefined()
  })

  it('blocks a free user who has used it with PAYWALL', async () => {
    await expect(assertCanStartCycle(setup(subscription({ free_cycle_used: true })), 'u1', 'c1')).rejects.toMatchObject({ code: 'PAYWALL' })
  })

  it('lets a free user who has used the free cycle carry on when DISABLE_FREE_LIMIT is true', async () => {
    process.env.DISABLE_FREE_LIMIT = 'true'
    try {
      await expect(assertCanStartCycle(setup(subscription({ free_cycle_used: true })), 'u1', 'c1')).resolves.toBeUndefined()
      const result = await getEntitlements(setup(subscription({ free_cycle_used: true })), 'u1')
      expect(result).toMatchObject({ canStartCycle: true, freeCycleUsed: true })
    } finally {
      delete process.env.DISABLE_FREE_LIMIT
    }
  })

  it('still enforces the daily cap when DISABLE_FREE_LIMIT is true', async () => {
    process.env.DISABLE_FREE_LIMIT = 'true'
    try {
      const capped = subscription({ free_cycle_used: true, daily_cycle_cap: 3 })
      await expect(assertCanStartCycle(setup(capped, 3), 'u1', 'c1')).rejects.toMatchObject({ code: 'DAILY_CAP' })
    } finally {
      delete process.env.DISABLE_FREE_LIMIT
    }
  })

  it('treats a lapsed paid plan like the free plan', async () => {
    const lapsed = subscription({ plan: 'family', status: 'active', free_cycle_used: true, current_period_end: '2020-01-01T00:00:00Z' })
    await expect(assertCanStartCycle(setup(lapsed), 'u1', 'c1')).rejects.toMatchObject({ code: 'PAYWALL' })
  })

  it('lets an active Family plan through while under the monthly limit', async () => {
    const family = subscription({ plan: 'family', status: 'active', free_cycle_used: true, current_period_end: '2999-01-01T00:00:00Z' })
    await expect(assertCanStartCycle(setup(family, 2), 'u1', 'c1')).resolves.toBeUndefined()
  })

  it('stops a Season pass at its 12 worksheets', async () => {
    const season = subscription({ plan: 'season', status: 'active', free_cycle_used: true, current_period_end: '2999-01-01T00:00:00Z' })
    await expect(assertCanStartCycle(setup(season, 12), 'u1', 'c1')).rejects.toMatchObject({ code: 'PAYWALL' })
  })

  it('applies the daily cap to everyone', async () => {
    const family = subscription({ plan: 'family', status: 'active', free_cycle_used: true, current_period_end: '2999-01-01T00:00:00Z', daily_cycle_cap: 3 })
    // 3 cycles already today (the same count is returned for the month, which is under the Family limit of 12).
    await expect(assertCanStartCycle(setup(family, 3), 'u1', 'c1')).rejects.toMatchObject({ code: 'DAILY_CAP' })
  })
})

describe('getEntitlements', () => {
  it('reports why a user is blocked, for the UI', async () => {
    const result = await getEntitlements(setup(subscription({ free_cycle_used: true })), 'u1')
    expect(result).toMatchObject({ canStartCycle: false, reason: 'PAYWALL', freeCycleUsed: true })
  })
  it('reports remaining cycles today', async () => {
    const result = await getEntitlements(setup(subscription(), 1), 'u1')
    expect(result.cyclesRemainingToday).toBe(2)
    expect(result.canStartCycle).toBe(true)
  })
  it('fails loudly if the subscription row is missing, rather than allowing access', async () => {
    service.client = fakeSupabase({})
    await expect(getEntitlements(fakeSupabase({ subscriptions: { rows: [] } }), 'u1')).rejects.toMatchObject({ code: 'INTERNAL' })
  })
})
