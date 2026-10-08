import { noContent } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { cycleIdParams, readAloudSchema } from '@/lib/schemas/worksheets'
import { setReadAloud } from '@/lib/worksheets/worksheets.service'

export const dynamic = 'force-dynamic'

export const PATCH = route(
  { name: 'cycles.update', auth: 'user', params: cycleIdParams, body: readAloudSchema },
  async ({ supabase, params, body }) => {
    await setReadAloud(supabase, params.cycleId, body.readAloud)
    return noContent()
  },
)
