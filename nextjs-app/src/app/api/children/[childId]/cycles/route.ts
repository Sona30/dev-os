import { ok } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { requireChild } from '@/lib/children/children.service'
import { listCycles } from '@/lib/results/results.service'
import { childIdParams } from '@/lib/schemas/children'

export const dynamic = 'force-dynamic'

export const GET = route({ name: 'cycles.list', auth: 'user', params: childIdParams }, async ({ supabase, params }) => {
  await requireChild(supabase, params.childId)
  return ok({ cycles: await listCycles(supabase, params.childId) })
})
