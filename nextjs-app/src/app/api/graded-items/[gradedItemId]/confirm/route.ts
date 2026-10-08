import { ok } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { confirmGradedItem } from '@/lib/grading/grading.service'
import { confirmItemSchema, gradedItemParams } from '@/lib/schemas/grading'

export const dynamic = 'force-dynamic'

export const POST = route(
  {
    name: 'graded-items.confirm',
    auth: 'user',
    params: gradedItemParams,
    body: confirmItemSchema,
    rateLimit: { windowSeconds: 60, max: 120 },
  },
  async ({ user, supabase, params, body }) => ok(await confirmGradedItem(supabase, user.id, params.gradedItemId, body)),
)
