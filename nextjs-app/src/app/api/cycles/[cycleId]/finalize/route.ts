import { accepted } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { finalizeReview } from '@/lib/grading/grading.service'
import { finalizeSchema } from '@/lib/schemas/grading'
import { cycleIdParams } from '@/lib/schemas/worksheets'
import { aiRouteLimits } from '@/lib/security/rateLimiter'

export const dynamic = 'force-dynamic'

export const POST = route(
  {
    name: 'cycles.finalize',
    auth: 'user',
    params: cycleIdParams,
    body: finalizeSchema,
    // Starts the recalibration job, which calls the AI for the parent-facing explanation.
    rateLimit: aiRouteLimits('cycles.finalize'),
  },
  async ({ user, supabase, params, body }) =>
    accepted(await finalizeReview(supabase, user.id, params.cycleId, body.skipUnconfirmed ?? false)),
)
