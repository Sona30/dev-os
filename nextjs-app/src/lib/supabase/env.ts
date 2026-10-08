// NEXT_PUBLIC_* values must be referenced as literal property accesses so Next.js can inline them
// into the browser bundle; do not refactor to dynamic lookups.

export function getSupabasePublicConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  return { url, anonKey }
}

export function requireSupabasePublicConfig(): { url: string; anonKey: string } {
  const config = getSupabasePublicConfig()
  if (!config) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local and restart the dev server.',
    )
  }
  return config
}
