import { accepted } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { submitSheetSchema } from '@/lib/schemas/grading'
import { worksheetIdParams } from '@/lib/schemas/worksheets'
import { submitSheet } from '@/lib/grading/grading.service'
import { aiRouteLimits } from '@/lib/security/rateLimiter'

export const dynamic = 'force-dynamic'

export const POST = route(
  {
    name: 'submissions.create',
    auth: 'user',
    params: worksheetIdParams,
    body: submitSheetSchema,
    rateLimit: aiRouteLimits('submissions.create'),
  },
  async ({ user, supabase, params, body }) => accepted(await submitSheet(supabase, user.id, params.worksheetId, body)),
)
