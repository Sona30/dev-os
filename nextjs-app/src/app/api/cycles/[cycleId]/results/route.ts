import { ok } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { getResults } from '@/lib/results/results.service'
import { cycleIdParams } from '@/lib/schemas/worksheets'

export const dynamic = 'force-dynamic'

export const GET = route(
  { name: 'results.get', auth: 'user', params: cycleIdParams },
  async ({ user, supabase, params }) => ok(await getResults(supabase, user.id, params.cycleId)),
)
