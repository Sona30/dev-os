import { ok } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { AppError } from '@/lib/errors/app-error'
import { loginSchema } from '@/lib/schemas/auth'
import { checkRateLimit, emailSubject, RATE_LIMITS } from '@/lib/security/rateLimiter'
import { createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Server-side email + password sign-in. Running signInWithPassword here (not in the browser) means the
 * limits below cannot be skipped by the app's own client, and the session cookies are set by the server
 * through createServerClient().
 *
 * Limits: 10 attempts per minute per IP (shared with the other auth forms) and 10 per 15 minutes per email
 * address from any IP. Every credential failure — unknown email, wrong password, unconfirmed email — gets the
 * same 401 INVALID_CREDENTIALS so the response never reveals whether an account exists.
 */
export const POST = route(
  { name: 'auth.login', auth: 'none', rateLimit: [RATE_LIMITS.auth], body: loginSchema },
  async ({ body, log }) => {
    await checkRateLimit(emailSubject(body.email), RATE_LIMITS.authPerEmail, log)

    const supabase = createServerClient()
    const { error } = await supabase.auth.signInWithPassword({ email: body.email, password: body.password })
    if (!error) return ok({ ok: true })

    if (error.status === 429 || error.code === 'over_request_rate_limit') {
      throw new AppError('RATE_LIMITED', { details: { retryAfterSeconds: 60 } })
    }
    if (
      error.status === 400 ||
      error.code === 'invalid_credentials' ||
      error.code === 'email_not_confirmed' ||
      error.code === 'user_not_found'
    ) {
      throw new AppError('INVALID_CREDENTIALS')
    }
    log.error({ err: { status: error.status, code: error.code } }, 'sign-in failed at Supabase Auth')
    throw new AppError('SERVICE_UNAVAILABLE', { cause: error })
  },
)
