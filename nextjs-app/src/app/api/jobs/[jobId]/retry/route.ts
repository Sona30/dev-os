import { z } from 'zod'
import { accepted } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { retryJob } from '@/lib/jobs/jobs.service'
import { uuid } from '@/lib/schemas/common'
import { aiRouteLimits } from '@/lib/security/rateLimiter'

export const dynamic = 'force-dynamic'

export const POST = route(
  {
    name: 'jobs.retry',
    auth: 'user',
    params: z.object({ jobId: uuid }),
    // A retry re-runs an AI step, so it counts against the AI budget.
    rateLimit: aiRouteLimits('jobs.retry'),
  },
  async ({ supabase, params }) => {
    const job = await retryJob(supabase, params.jobId)
    return accepted({ jobId: job.id })
  },
)
