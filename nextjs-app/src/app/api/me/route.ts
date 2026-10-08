import { route } from '@/lib/api/route'
import { ok } from '@/lib/api/respond'
import { getProfile, updateProfile } from '@/lib/auth/profiles.service'
import { profilePatchSchema } from '@/lib/schemas/auth'

export const dynamic = 'force-dynamic'

export const GET = route({ name: 'me.get', auth: 'user' }, async ({ user, supabase }) => {
  return ok(await getProfile(supabase, user.id))
})

export const PATCH = route(
  { name: 'me.patch', auth: 'user', body: profilePatchSchema },
  async ({ user, supabase, body }) => {
    return ok(await updateProfile(supabase, user.id, body))
  },
)
