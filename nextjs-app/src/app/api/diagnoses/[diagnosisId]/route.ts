import { ok } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { getDiagnosis } from '@/lib/diagnosis/diagnosis.service'
import { diagnosisIdParams } from '@/lib/schemas/reports'

export const dynamic = 'force-dynamic'

export const GET = route(
  { name: 'diagnoses.get', auth: 'user', params: diagnosisIdParams },
  async ({ supabase, params }) => ok(await getDiagnosis(supabase, params.diagnosisId)),
)
