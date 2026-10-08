import { noContent } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Server-side sign-out. Revokes the refresh tokens in Supabase Auth and clears the session cookies on this
 * response. The browser calls this instead of supabase.auth.signOut(). Always answers 204, so a stale or
 * already-cleared session still ends on the login page.
 */
export const POST = route({ name: 'auth.logout', auth: 'none' }, async ({ log }) => {
  const supabase = createServerClient()
  const { error } = await supabase.auth.signOut()
  // "No session" is the expected outcome for a double click or an expired session.
  if (error && error.name !== 'AuthSessionMissingError') {
    log.warn({ err: { status: error.status, code: error.code } }, 'sign-out could not revoke the session')
  }
  return noContent()
})
