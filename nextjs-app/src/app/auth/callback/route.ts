import { NextResponse, type NextRequest } from 'next/server'
import { safeNext } from '@/lib/auth/safe-next'
import { getSupabasePublicConfig } from '@/lib/supabase/env'
import { createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Supabase email links (confirm sign-up, reset password) land here with ?code=...
// We exchange the code for a session cookie, then send the parent on to a same-origin path.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  if (!code || !getSupabasePublicConfig()) {
    return NextResponse.redirect(new URL('/login?error=link_expired', origin))
  }

  const supabase = createServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(new URL('/login?error=link_expired', origin))
  }
  return NextResponse.redirect(new URL(next, origin))
}
