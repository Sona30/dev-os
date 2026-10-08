import 'server-only'
import { createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { AppError } from '@/lib/errors/app-error'
import type { Logger } from '@/lib/logger'
import { createServiceClient } from '@/lib/supabase/service'

// Sliding-window rate limiting backed by the `rate_limit_events` table (supabase/rls-policies.sql).
// Every read and write goes through the service role inside the `rate_limit_check` function, so a user can
// neither see nor reset their own counters. Subjects are pseudonymised: IPs and emails are hashed before
// they are stored, user ids are stored as-is (they are already opaque).

export interface RateLimitRule {
  /** Bucket name. Routes that share a bucket share a budget (e.g. every auth form counts against "auth"). */
  action: string
  windowSeconds: number
  max: number
  /** Count per signed-in user (default for authenticated routes) or per client IP. */
  by?: 'user' | 'ip'
  /**
   * When the limiter itself is unreachable: true refuses the request (auth, AI and upload endpoints, where an
   * unbounded burst costs money or enables brute force); false lets it through and logs loudly.
   */
  failClosed?: boolean
}

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** The limits that protect specific surfaces. Everything else gets the per-route defaults in lib/api/route.ts. */
export const RATE_LIMITS = {
  /** Login, sign-up, password reset: 10 attempts per minute per IP, shared across all auth forms. */
  auth: { action: 'auth', windowSeconds: MINUTE, max: 10, by: 'ip', failClosed: true },
  /** Login attempts against one email address from any IP (credential stuffing): 10 per 15 minutes. */
  authPerEmail: { action: 'auth.email', windowSeconds: 15 * MINUTE, max: 10, failClosed: true },
  /** Any single AI-backed endpoint (report reading, analysis, generation, grading, recalibration): 5 per hour. */
  aiPerEndpointHourly: (route: string): RateLimitRule => ({
    action: `${route}.hourly`,
    windowSeconds: HOUR,
    max: 5,
    failClosed: true,
  }),
  /** All AI-backed endpoints together: 20 per hour per user (one full practice cycle uses about 5). */
  aiHourly: { action: 'ai.hourly', windowSeconds: HOUR, max: 20, failClosed: true },
  /** Upload batches signed per day per user (each batch is up to 5 report pages or 4 photos). */
  uploadsDaily: { action: 'uploads.daily', windowSeconds: DAY, max: 20, failClosed: true },
} as const satisfies Record<string, RateLimitRule | ((route: string) => RateLimitRule)>

/** Every rule an AI-backed route should carry: a per-minute burst limit, its own hourly cap, and the shared cap. */
export function aiRouteLimits(route: string, perMinute = 10): RateLimitRule[] {
  return [
    { action: route, windowSeconds: MINUTE, max: perMinute },
    RATE_LIMITS.aiPerEndpointHourly(route),
    RATE_LIMITS.aiHourly,
  ]
}

export function getClientIp(req: NextRequest): string {
  const netlify = req.headers.get('x-nf-client-connection-ip')
  if (netlify) return netlify.trim()
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown'
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}

function pseudonym(kind: 'ip' | 'email', value: string): string {
  return `${kind}:${createHash('sha256').update(value).digest('hex').slice(0, 32)}`
}

export function userSubject(userId: string): string {
  return `user:${userId}`
}

export function ipSubject(req: NextRequest): string {
  return pseudonym('ip', getClientIp(req))
}

export function emailSubject(email: string): string {
  return pseudonym('email', email.trim().toLowerCase())
}

function rateLimitingDisabled(): boolean {
  // Never honour the off switch in production, where a stray env var would silently remove the protection.
  return process.env.RATE_LIMIT_ENABLED === 'false' && process.env.NODE_ENV !== 'production'
}

/**
 * Records one hit against `rule` for `subject`. Throws RATE_LIMITED (with the exact seconds until a slot
 * frees up) when the window is full; the hit is not recorded in that case.
 */
export async function checkRateLimit(subject: string, rule: RateLimitRule, log: Logger): Promise<void> {
  if (rateLimitingDisabled()) return
  let retryAfterSeconds: number
  try {
    const { data, error } = await createServiceClient().rpc('rate_limit_check', {
      p_subject: subject,
      p_action: rule.action,
      p_window_seconds: rule.windowSeconds,
      p_max: rule.max,
    })
    if (error) throw error
    retryAfterSeconds = Number(data)
    if (!Number.isFinite(retryAfterSeconds)) throw new Error(`rate_limit_check returned ${String(data)}`)
  } catch (error) {
    if (rule.failClosed) {
      log.error({ err: error, action: rule.action }, 'rate limiter unavailable; request refused')
      throw new AppError('SERVICE_UNAVAILABLE', { cause: error })
    }
    // For ordinary reads and writes the limiter is a protection layer, not a dependency of correctness.
    log.error({ err: error, action: rule.action }, 'rate limiter unavailable; request allowed')
    return
  }
  if (retryAfterSeconds > 0) {
    log.warn({ action: rule.action }, 'rate limit exceeded')
    throw new AppError('RATE_LIMITED', { details: { retryAfterSeconds } })
  }
}

/** Applies several rules in order; the first one that is full rejects the request. */
export async function enforceRateLimits(
  rules: RateLimitRule[],
  subjects: { user: string | null; ip: string },
  log: Logger,
): Promise<void> {
  for (const rule of rules) {
    const by = rule.by ?? (subjects.user ? 'user' : 'ip')
    const subject = by === 'user' && subjects.user ? subjects.user : subjects.ip
    await checkRateLimit(subject, rule, log)
  }
}
