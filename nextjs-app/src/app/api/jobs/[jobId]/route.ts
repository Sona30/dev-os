import { z } from 'zod'
import { ok } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { getJob } from '@/lib/jobs/jobs.service'
import { uuid } from '@/lib/schemas/common'

export const dynamic = 'force-dynamic'

// Polled every 2-5 seconds while a job runs, so it gets a higher read limit than the default.
export const GET = route(
  {
    name: 'jobs.get',
    auth: 'user',
    params: z.object({ jobId: uuid }),
    rateLimit: { windowSeconds: 60, max: 240 },
  },
  async ({ supabase, params }) => ok(await getJob(supabase, params.jobId)),
)
