import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError } from '@/lib/errors/app-error'
import { createServiceClient } from '@/lib/supabase/service'
import {
  FAMILY_WORKSHEETS_PER_CHILD_PER_MONTH,
  SEASON_WEEKS,
  SEASON_WORKSHEETS,
  type PlanTier,
} from './plans'

// Who may start another worksheet cycle, and why not (docs/specs/12). The server decides; the browser only
// reads the answer to show the right message. Checked BEFORE any model call so a blocked request costs nothing.

export type BlockReason = 'PAYWALL' | 'DAILY_CAP'

export interface Entitlements {
  plan: PlanTier
  status: 'none' | 'active' | 'past_due' | 'canceled'
  canStartCycle: boolean
  reason?: BlockReason
  cyclesRemainingToday: number
  freeCycleUsed: boolean
  childLimit: number
  waitlistOptIn: boolean
}

interface SubscriptionRow {
  plan: PlanTier
  status: 'none' | 'active' | 'past_due' | 'canceled'
  free_cycle_used: boolean
  waitlist_opt_in: boolean
  child_limit: number
  daily_cycle_cap: number
  current_period_end: string | null
}

const COLUMNS = 'plan, status, free_cycle_used, waitlist_opt_in, child_limit, daily_cycle_cap, current_period_end'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function startOfUtcDay(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
}

function startOfUtcMonth(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

async function loadSubscription(supabase: SupabaseClient, userId: string): Promise<SubscriptionRow> {
  const { data, error } = await supabase.from('subscriptions').select(COLUMNS).eq('user_id', userId).maybeSingle()
  if (error) throw new AppError('INTERNAL', { cause: error })
  if (!data) throw new AppError('INTERNAL', { cause: new Error(`subscriptions row missing for user ${userId}`) })
  return data as SubscriptionRow
}

/** Cycles started since `since` (failed ones do not count against anyone's allowance). */
async function countCycles(childIds: string[], since: string): Promise<number> {
  if (childIds.length === 0) return 0
  const { count, error } = await createServiceClient()
    .from('cycles')
    .select('id', { count: 'exact', head: true })
    .in('child_id', childIds)
    .gte('created_at', since)
    .neq('status', 'failed')
  if (error) throw new AppError('INTERNAL', { cause: error })
  return count ?? 0
}

async function childIdsOf(userId: string): Promise<string[]> {
  const { data, error } = await createServiceClient().from('children').select('id').eq('user_id', userId)
  if (error) throw new AppError('INTERNAL', { cause: error })
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id)
}

function isPaidAndCurrent(subscription: SubscriptionRow): boolean {
  if (subscription.plan === 'free' || subscription.status !== 'active') return false
  return !subscription.current_period_end || new Date(subscription.current_period_end).getTime() > Date.now()
}

/** Work out the answer for a user, optionally for a specific child (Family limits are per child). */
async function evaluate(
  supabase: SupabaseClient,
  userId: string,
  childId?: string,
): Promise<Entitlements> {
  const subscription = await loadSubscription(supabase, userId)
  const childIds = await childIdsOf(userId)

  const usedToday = await countCycles(childIds, startOfUtcDay())
  const cyclesRemainingToday = Math.max(0, subscription.daily_cycle_cap - usedToday)

  let reason: BlockReason | undefined
  if (!isPaidAndCurrent(subscription)) {
    // Free plan, or a paid plan that has lapsed: only the single free cycle is available.
    if (subscription.free_cycle_used) reason = 'PAYWALL'
  } else if (subscription.plan === 'season') {
    const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end).getTime() : Date.now()
    const periodStart = new Date(periodEnd - SEASON_WEEKS * WEEK_MS).toISOString()
    if ((await countCycles(childIds, periodStart)) >= SEASON_WORKSHEETS) reason = 'PAYWALL'
  } else if (subscription.plan === 'family' && childId) {
    if ((await countCycles([childId], startOfUtcMonth())) >= FAMILY_WORKSHEETS_PER_CHILD_PER_MONTH) reason = 'PAYWALL'
  }
  if (!reason && cyclesRemainingToday === 0) reason = 'DAILY_CAP'

  return {
    plan: subscription.plan,
    status: subscription.status,
    canStartCycle: reason === undefined,
    reason,
    cyclesRemainingToday,
    freeCycleUsed: subscription.free_cycle_used,
    childLimit: subscription.child_limit,
    waitlistOptIn: subscription.waitlist_opt_in,
  }
}

export function getEntitlements(supabase: SupabaseClient, userId: string): Promise<Entitlements> {
  return evaluate(supabase, userId)
}

/** Throws PAYWALL or DAILY_CAP. Call before allocating a cycle or contacting the AI. */
export async function assertCanStartCycle(supabase: SupabaseClient, userId: string, childId: string): Promise<void> {
  const entitlements = await evaluate(supabase, userId, childId)
  if (entitlements.reason) throw new AppError(entitlements.reason)
}

/** The free diagnostic is spent only when a worksheet is actually delivered; a failed attempt costs nothing. */
export async function consumeFreeCycle(userId: string): Promise<void> {
  const { error } = await createServiceClient()
    .from('subscriptions')
    .update({ free_cycle_used: true })
    .eq('user_id', userId)
    .eq('plan', 'free')
  if (error) throw new AppError('INTERNAL', { cause: error })
}
