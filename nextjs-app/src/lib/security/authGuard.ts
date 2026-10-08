import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { AppError, toEnvelope } from '@/lib/errors/app-error'
import { createServerClient } from '@/lib/supabase/server'

// Authentication and request-origin checks shared by every route handler.
// Sessions are always verified with `auth.getUser()` (a round trip to Supabase Auth), never `getSession()`,
// which only decodes the cookie and can be forged.

export type AuthResult =
  | { ok: true; user: User; supabase: SupabaseClient }
  | { ok: false; response: NextResponse }

/** The verified user for this request's session cookie, or null. */
export async function getAuthenticatedUser(supabase: SupabaseClient): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user
}

/**
 * For route handlers that don't use lib/api/route.ts: returns the user and a user-scoped (RLS) client, or a
 * ready-made 401 response in the standard error envelope.
 */
export async function requireAuth(): Promise<AuthResult> {
  const supabase = createServerClient()
  const user = await getAuthenticatedUser(supabase)
  if (!user) {
    const error = new AppError('UNAUTHENTICATED')
    return { ok: false, response: NextResponse.json(toEnvelope(error), { status: error.status }) }
  }
  return { ok: true, user, supabase }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function allowedOrigins(req: NextRequest): Set<string> {
  const origins = new Set<string>([req.nextUrl.origin])
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  if (host) {
    origins.add(`https://${host}`)
    if (process.env.NODE_ENV !== 'production') origins.add(`http://${host}`)
  }
  for (const configured of [process.env.NEXT_PUBLIC_SITE_URL, process.env.URL, process.env.DEPLOY_PRIME_URL]) {
    if (!configured) continue
    try {
      origins.add(new URL(configured).origin)
    } catch {
      // Ignore a malformed env value rather than taking the API down.
    }
  }
  return origins
}

/**
 * CSRF protection for cookie-authenticated API calls. State-changing requests must come from this site
 * (Origin header, which browsers always send on cross-origin and on same-origin non-GET fetches) and, when
 * they carry a body, must be JSON — an HTML form cannot send `application/json` cross-site without a CORS
 * preflight, which we never grant.
 */
export function assertSameOriginRequest(req: NextRequest, hasJsonBody: boolean): void {
  if (SAFE_METHODS.has(req.method)) return

  const origin = req.headers.get('origin')
  if (origin && !allowedOrigins(req).has(origin)) throw new AppError('FORBIDDEN')

  // Browsers that omit Origin still send Sec-Fetch-Site; refuse anything explicitly cross-site.
  const fetchSite = req.headers.get('sec-fetch-site')
  if (!origin && fetchSite === 'cross-site') throw new AppError('FORBIDDEN')

  if (hasJsonBody) {
    const contentType = req.headers.get('content-type') ?? ''
    if (!/^application\/json\b/i.test(contentType)) throw new AppError('UNSUPPORTED_CONTENT_TYPE')
  }
}
