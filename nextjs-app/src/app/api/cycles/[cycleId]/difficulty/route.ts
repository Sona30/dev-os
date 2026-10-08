import { noContent } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { cycleIdParams, difficultySchema } from '@/lib/schemas/worksheets'
import { setDifficultyFeedback } from '@/lib/worksheets/worksheets.service'

export const dynamic = 'force-dynamic'

export const POST = route(
  { name: 'cycles.difficulty', auth: 'user', params: cycleIdParams, body: difficultySchema },
  async ({ supabase, params, body }) => {
    await setDifficultyFeedback(supabase, params.cycleId, body.value)
    return noContent()
  },
)
