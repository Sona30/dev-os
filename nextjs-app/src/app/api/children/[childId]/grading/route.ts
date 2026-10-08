import { ok } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { requireChild } from '@/lib/children/children.service'
import { getGradingState } from '@/lib/grading/grading.service'
import { childIdParams } from '@/lib/schemas/children'

export const dynamic = 'force-dynamic'

export const GET = route(
  { name: 'grading.state', auth: 'user', params: childIdParams },
  async ({ supabase, params }) => {
    await requireChild(supabase, params.childId)
    return ok(await getGradingState(supabase, params.childId))
  },
)
