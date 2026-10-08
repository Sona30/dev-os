import { accepted, ok } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { startDiagnosis } from '@/lib/diagnosis/diagnosis.service'
import { childIdParams } from '@/lib/schemas/children'
import { diagnoseRequestSchema } from '@/lib/schemas/reports'
import { aiRouteLimits } from '@/lib/security/rateLimiter'

export const dynamic = 'force-dynamic'

export const POST = route(
  {
    name: 'diagnoses.start',
    auth: 'user',
    params: childIdParams,
    body: diagnoseRequestSchema,
    rateLimit: aiRouteLimits('diagnoses.start'),
  },
  async ({ user, supabase, params, body }) => {
    const result = await startDiagnosis(supabase, user.id, params.childId, body.reportId)
    // 200 when the analysis already exists, 202 when a job was started.
    return result.jobId ? accepted({ jobId: result.jobId }) : ok({ diagnosisId: result.diagnosisId })
  },
)
