import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { requireSupabasePublicConfig } from './env'

/**
 * Service-role client: bypasses RLS. Use only in repositories/jobs after an explicit ownership check
 * (docs/specs/00-overview-and-conventions.md §6). Never import from client code.
 */
export function createServiceClient() {
  const { url } = requireSupabasePublicConfig()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local (server only).')
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
