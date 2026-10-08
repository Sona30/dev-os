import { createBrowserClient as createSsrBrowserClient } from '@supabase/ssr'
import { requireSupabasePublicConfig } from './env'

/** Browser client: auth and signed-URL uploads only. All data access goes through /api routes. */
export function createBrowserClient() {
  const { url, anonKey } = requireSupabasePublicConfig()
  return createSsrBrowserClient(url, anonKey)
}
