import { accepted, ok } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { childIdParams } from '@/lib/schemas/children'
import { startWorksheetSchema } from '@/lib/schemas/worksheets'
import { getWorksheetState, startWorksheet } from '@/lib/worksheets/worksheets.service'
import { requireChild } from '@/lib/children/children.service'
import { aiRouteLimits } from '@/lib/security/rateLimiter'

export const dynamic = 'force-dynamic'

export const GET = route(
  { name: 'worksheets.state', auth: 'user', params: childIdParams },
  async ({ supabase, params }) => {
    await requireChild(supabase, params.childId)
    return ok(await getWorksheetState(supabase, params.childId))
  },
)

export const POST = route(
  {
    name: 'worksheets.start',
    auth: 'user',
    params: childIdParams,
    body: startWorksheetSchema,
    rateLimit: aiRouteLimits('worksheets.start'),
  },
  async ({ user, supabase, params, body }) => accepted(await startWorksheet(supabase, user.id, params.childId, body)),
)
