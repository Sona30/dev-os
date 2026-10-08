import { ok } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { getProgress } from '@/lib/results/progress.service'
import { childIdParams } from '@/lib/schemas/children'

export const dynamic = 'force-dynamic'

export const GET = route(
  { name: 'progress.get', auth: 'user', params: childIdParams },
  async ({ supabase, params }) => ok(await getProgress(supabase, params.childId)),
)
