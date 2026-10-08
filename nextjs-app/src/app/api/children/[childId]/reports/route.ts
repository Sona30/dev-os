import { accepted, created } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { requireChild } from '@/lib/children/children.service'
import { childIdParams } from '@/lib/schemas/children'
import { createReportSchema } from '@/lib/schemas/reports'
import { createManualReport, createUploadReport } from '@/lib/reports/reports.service'
import { sanitizeFieldsForLLM } from '@/lib/security/promptInjectionGuard'
import { aiRouteLimits } from '@/lib/security/rateLimiter'

export const dynamic = 'force-dynamic'

// Either { uploadIds } (report pages → background parse job) or { manual } (typed score/placement).
// Both lead to AI work (reading the pages, then the gap analysis), so both count against the AI budget.
export const POST = route(
  {
    name: 'reports.create',
    auth: 'user',
    params: childIdParams,
    body: createReportSchema,
    rateLimit: aiRouteLimits('reports.create'),
  },
  async ({ user, supabase, params, body }) => {
    const child = await requireChild(supabase, params.childId)
    if ('uploadIds' in body) {
      const { report, jobId } = await createUploadReport(supabase, user.id, child, body.uploadIds)
      return accepted({ reportId: report.id, jobId })
    }
    // The placement is sent to the AI with the child profile.
    const manual = { ...body.manual, ...sanitizeFieldsForLLM({ placement: body.manual.placement }) }
    return created({ report: await createManualReport(supabase, child, manual) })
  },
)
