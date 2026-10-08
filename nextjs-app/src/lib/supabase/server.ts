import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient as createSsrServerClient } from '@supabase/ssr'
import type { CookieOptions } from '@supabase/ssr'
import { requireSupabasePublicConfig } from './env'

/**
 * User-scoped client for Server Components and route handlers. Row Level Security applies.
 * Authorise with `supabase.auth.getUser()`, never `getSession()`.
 */
export function createServerClient() {
  const { url, anonKey } = requireSupabasePublicConfig()
  const cookieStore = cookies()

  return createSsrServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Called from a Server Component, where cookies are read-only. The middleware refreshes the session.
        }
      },
    },
  })
}
