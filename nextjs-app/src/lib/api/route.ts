import 'server-only'
import { randomUUID } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { ZodError, type ZodType, type ZodTypeDef } from 'zod'
import { AppError, toEnvelope } from '@/lib/errors/app-error'
import { getLogger, hashUserId, type Logger } from '@/lib/logger'
import { assertSameOriginRequest, getAuthenticatedUser } from '@/lib/security/authGuard'
import { enforceRateLimits, ipSubject, userSubject, type RateLimitRule } from '@/lib/security/rateLimiter'
import { createServerClient } from '@/lib/supabase/server'

// Request pipeline — docs/specs/00-overview-and-conventions.md §4.
// Order is fixed: request id → origin/CSRF check → auth → rate limit → validation → handler → error mapping.

type AuthMode = 'user' | 'none'
type Schema<T> = ZodType<T, ZodTypeDef, unknown>

/** A single per-route limit; its bucket is the route name. Use RateLimitRule[] for shared or multiple buckets. */
export interface RateLimitConfig {
  windowSeconds: number
  max: number
  /** Bucket by user id (default for authenticated routes) or by client IP. */
  by?: 'user' | 'ip'
}

export interface RouteConfig<A extends AuthMode, P, Q, B> {
  /** Stable route name used for rate-limit keys and log lines, e.g. "me.patch". */
  name: string
  auth: A
  rateLimit?: RateLimitConfig | RateLimitRule[] | false
  params?: Schema<P>
  query?: Schema<Q>
  body?: Schema<B>
}

export interface RouteContext<A extends AuthMode, P, Q, B> {
  req: NextRequest
  requestId: string
  log: Logger
  user: A extends 'user' ? User : null
  /** User-scoped client (RLS applies). Null on unauthenticated routes. */
  supabase: A extends 'user' ? SupabaseClient : null
  params: P
  query: Q
  body: B
}

type Segment = { params?: Record<string, string | string[]> }

const DEFAULT_READ_LIMIT: RateLimitConfig = { windowSeconds: 60, max: 120 }
const DEFAULT_WRITE_LIMIT: RateLimitConfig = { windowSeconds: 60, max: 30 }
const SECURITY_CODES = new Set(['FORBIDDEN', 'PROMPT_INJECTION', 'UNSUPPORTED_CONTENT_TYPE'])

function zodToAppError(error: ZodError): AppError {
  return new AppError('VALIDATION_ERROR', { details: { fieldErrors: error.flatten().fieldErrors } })
}

function parseWith<T>(schema: Schema<T> | undefined, value: unknown): T {
  if (!schema) return undefined as T
  const result = schema.safeParse(value)
  if (!result.success) throw zodToAppError(result.error)
  return result.data
}

function rulesFor(name: string, method: string, config: RateLimitConfig | RateLimitRule[] | undefined): RateLimitRule[] {
  if (Array.isArray(config)) return config
  const isRead = method === 'GET' || method === 'HEAD'
  const single = config ?? (isRead ? DEFAULT_READ_LIMIT : DEFAULT_WRITE_LIMIT)
  return [{ action: name, ...single }]
}

function errorResponse(error: unknown, requestId: string, log: Logger): NextResponse {
  let appError: AppError
  if (error instanceof AppError) {
    appError = error
  } else if (error instanceof ZodError) {
    appError = zodToAppError(error)
  } else {
    log.error({ err: error }, 'unhandled error in route handler')
    appError = new AppError('INTERNAL')
  }
  if (appError.status >= 500) log.error({ err: appError.cause ?? appError, code: appError.code }, 'request failed')
  // Security refusals are logged (without the offending text) so abuse shows up in the logs.
  if (SECURITY_CODES.has(appError.code)) {
    log.warn({ code: appError.code, reason: (appError.cause as Error | undefined)?.message }, 'request refused')
  }

  const response = NextResponse.json(toEnvelope(appError), { status: appError.status })
  response.headers.set('x-request-id', requestId)
  const retryAfter = (appError.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds
  if (appError.code === 'RATE_LIMITED' && retryAfter) response.headers.set('Retry-After', String(retryAfter))
  return response
}

export function route<A extends AuthMode, P = undefined, Q = undefined, B = undefined>(
  config: RouteConfig<A, P, Q, B>,
  handler: (ctx: RouteContext<A, P, Q, B>) => Promise<Response>,
) {
  return async (req: NextRequest, segment: Segment = {}): Promise<Response> => {
    const requestId = randomUUID()
    const startedAt = Date.now()
    let log = getLogger({ requestId, route: config.name })

    try {
      // 1. CSRF: state-changing calls must come from this site, and bodies must be JSON
      assertSameOriginRequest(req, Boolean(config.body))

      // 2. Auth
      let user: User | null = null
      let supabase: SupabaseClient | null = null
      if (config.auth === 'user') {
        supabase = createServerClient()
        user = await getAuthenticatedUser(supabase)
        if (!user) throw new AppError('UNAUTHENTICATED')
        log = log.child({ userIdHash: hashUserId(user.id) })
      }

      // 3. Rate limit (sliding window, lib/security/rateLimiter.ts)
      if (config.rateLimit !== false) {
        await enforceRateLimits(
          rulesFor(config.name, req.method, config.rateLimit),
          { user: user ? userSubject(user.id) : null, ip: ipSubject(req) },
          log,
        )
      }

      // 4. Validation (params, query, JSON body)
      const params = parseWith(config.params, segment.params ?? {})
      const query = parseWith(config.query, Object.fromEntries(req.nextUrl.searchParams.entries()))
      let body: B = undefined as B
      if (config.body) {
        let raw: unknown
        try {
          raw = await req.json()
        } catch {
          throw new AppError('VALIDATION_ERROR', { message: 'The request body must be valid JSON.' })
        }
        body = parseWith(config.body, raw)
      }

      // 5. Handler
      const response = await handler({
        req,
        requestId,
        log,
        user: user as RouteContext<A, P, Q, B>['user'],
        supabase: supabase as RouteContext<A, P, Q, B>['supabase'],
        params,
        query,
        body,
      })
      response.headers.set('x-request-id', requestId)
      log.info({ method: req.method, status: response.status, durationMs: Date.now() - startedAt }, 'request')
      return response
    } catch (error) {
      const response = errorResponse(error, requestId, log)
      log.info({ method: req.method, status: response.status, durationMs: Date.now() - startedAt }, 'request')
      return response
    }
  }
}
