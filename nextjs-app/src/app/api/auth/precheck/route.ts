import { route } from '@/lib/api/route'
import { ok } from '@/lib/api/respond'
import { RATE_LIMITS } from '@/lib/security/rateLimiter'

export const dynamic = 'force-dynamic'

/**
 * Called by the sign-up, forgot-password and resend-confirmation forms just before they talk to Supabase Auth
 * (login has its own server-side route, app/api/auth/login).
 * It only increments the shared per-IP auth limiter (10 per minute) and answers 200 or 429, which lets us
 * throttle brute-force attempts even though Supabase handles the credential check itself.
 */
export const POST = route(
  {
    name: 'auth.precheck',
    auth: 'none',
    rateLimit: [RATE_LIMITS.auth],
  },
  async () => ok({ ok: true }),
)
