import type { SupabaseClient } from '@supabase/supabase-js'

// A tiny stand-in for the Supabase query builder, enough for services that chain select/filter/order/limit and
// then await or call maybeSingle(). Each table returns the rows (and optional count) it was given, whatever the
// filters are: these tests are about what the service does with the rows, not about SQL filtering.

export interface FakeTable {
  rows?: unknown[]
  count?: number
  error?: { message: string }
}

export interface FakeOptions {
  signedUrls?: boolean
}

export function fakeSupabase(tables: Record<string, FakeTable>, options: FakeOptions = {}): SupabaseClient {
  const from = (name: string) => {
    const table = tables[name] ?? {}
    const rows = table.rows ?? []
    const result = { data: rows, count: table.count ?? rows.length, error: table.error ?? null }
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'neq', 'in', 'gte', 'lte', 'order', 'limit', 'contains', 'not', 'is', 'update', 'insert']) {
      chain[method] = () => chain
    }
    chain.maybeSingle = async () => ({ data: rows[0] ?? null, error: table.error ?? null })
    chain.single = chain.maybeSingle
    chain.then = (resolve: (value: unknown) => unknown) => resolve(result)
    return chain
  }
  const storage = {
    from: () => ({
      createSignedUrl: async (path: string) =>
        options.signedUrls === false
          ? { data: null, error: { message: 'nope' } }
          : { data: { signedUrl: `https://signed.example/${path}` }, error: null },
    }),
  }
  return { from, storage } as unknown as SupabaseClient
}
