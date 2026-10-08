import { ok } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { getEntitlements } from '@/lib/entitlements/entitlements.service'

export const dynamic = 'force-dynamic'

export const GET = route({ name: 'me.entitlements', auth: 'user' }, async ({ user, supabase }) =>
  ok(await getEntitlements(supabase, user.id)),
)
