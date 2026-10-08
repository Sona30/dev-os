import { ok } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { requireChild } from '@/lib/children/children.service'
import { findLatestDiagnosis } from '@/lib/diagnosis/diagnosis.service'
import { AppError } from '@/lib/errors/app-error'
import { childIdParams } from '@/lib/schemas/children'

export const dynamic = 'force-dynamic'

export const GET = route(
  { name: 'diagnoses.latest', auth: 'user', params: childIdParams },
  async ({ supabase, params }) => {
    await requireChild(supabase, params.childId)
    const diagnosis = await findLatestDiagnosis(supabase, params.childId)
    if (!diagnosis) throw new AppError('NOT_FOUND', { message: 'No gap analysis has been run yet.' })
    return ok(diagnosis)
  },
)
