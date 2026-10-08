import 'server-only'
import { cache } from 'react'
import type { User } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { getSupabasePublicConfig } from '@/lib/supabase/env'

/**
 * Returns the verified signed-in user or null. Uses `auth.getUser()` (validated against Supabase Auth),
 * never the unverified cookie session. Memoised per request.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  if (!getSupabasePublicConfig()) return null
  const supabase = createServerClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user
})
