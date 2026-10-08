import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Helpers for tests that talk to a real Supabase project. They are opt-in (RUN_INTEGRATION=1) because they
// create and delete real auth users. Every user is created with a unique "tr-test-" address and removed in
// cleanup(), which cascades to everything they own.

export const integrationEnabled =
  process.env.RUN_INTEGRATION === '1' &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY as string

const options = { auth: { persistSession: false, autoRefreshToken: false } }

export function serviceClient(): SupabaseClient {
  return createClient(url(), serviceKey(), options)
}

export interface TestUser {
  id: string
  email: string
  client: SupabaseClient
}

const created: string[] = []

export async function createTestUser(): Promise<TestUser> {
  const service = serviceClient()
  const email = `tr-test-${randomUUID()}@example.com`
  const password = `Tr-${randomUUID()}`
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`Could not create test user: ${error?.message}`)
  created.push(data.user.id)

  const client = createClient(url(), anonKey(), options)
  const signedIn = await client.auth.signInWithPassword({ email, password })
  if (signedIn.error) throw new Error(`Could not sign in test user: ${signedIn.error.message}`)
  return { id: data.user.id, email, client }
}

export async function cleanupTestUsers(): Promise<void> {
  const service = serviceClient()
  for (const id of created.splice(0)) await service.auth.admin.deleteUser(id)
}

export async function seedChild(userId: string, nickname = 'Maya'): Promise<string> {
  const { data, error } = await serviceClient()
    .from('children')
    .insert({ user_id: userId, nickname, grade: 1 })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Could not seed child: ${error?.message}`)
  return data.id as string
}
