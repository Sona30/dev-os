import { noContent } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { requireChild } from '@/lib/children/children.service'
import { AppError } from '@/lib/errors/app-error'
import { purgeChildImages } from '@/lib/privacy/retention'
import { childIdParams } from '@/lib/schemas/children'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

// "Delete all photos": removes every stored image for this child straight away. Worksheets, results and
// progress are kept. Refused while a photo is being read, because that work would then fail half-way.
export const POST = route(
  {
    name: 'children.purge-images',
    auth: 'user',
    params: childIdParams,
    rateLimit: { windowSeconds: 60, max: 5 },
  },
  async ({ supabase, params, log }) => {
    const child = await requireChild(supabase, params.childId)

    const { count, error } = await supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('child_id', child.id)
      .in('type', ['parse_report', 'grade_sheet'])
      .in('status', ['queued', 'running'])
    if (error) throw new AppError('INTERNAL', { cause: error })
    if ((count ?? 0) > 0) {
      throw new AppError('CONFLICT', { message: 'We’re reading a photo right now. Please try again in a minute.' })
    }

    const removed = await purgeChildImages(createServiceClient(), child.id)
    log.info({ removed }, 'child images deleted at the parent’s request')
    return noContent()
  },
)
