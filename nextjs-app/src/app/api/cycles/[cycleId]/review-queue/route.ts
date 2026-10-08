import { ok } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { getReviewQueue } from '@/lib/grading/grading.service'
import { cycleIdParams } from '@/lib/schemas/worksheets'

export const dynamic = 'force-dynamic'

export const GET = route(
  { name: 'review-queue.get', auth: 'user', params: cycleIdParams },
  async ({ supabase, params }) => ok(await getReviewQueue(supabase, params.cycleId)),
)
