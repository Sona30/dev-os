import { created, ok } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { createChild, getChildren } from '@/lib/children/children.service'
import { createChildSchema } from '@/lib/schemas/children'
import { sanitizeForLLM } from '@/lib/security/promptInjectionGuard'

export const dynamic = 'force-dynamic'

export const GET = route({ name: 'children.list', auth: 'user' }, async ({ supabase }) => {
  return ok({ children: await getChildren(supabase) })
})

export const POST = route(
  { name: 'children.create', auth: 'user', body: createChildSchema },
  async ({ user, supabase, body }) => {
    // The nickname is sent to the AI with every request about this child.
    const nickname = sanitizeForLLM(body.nickname, 'nickname')
    return created(await createChild(supabase, user.id, { ...body, nickname }))
  },
)
