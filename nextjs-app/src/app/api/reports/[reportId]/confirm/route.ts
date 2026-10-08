import { ok } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { confirmReportSchema, reportIdParams } from '@/lib/schemas/reports'
import { confirmReport } from '@/lib/reports/reports.service'
import { sanitizeFieldsForLLM, sanitizeForLLM } from '@/lib/security/promptInjectionGuard'
import { aiRouteLimits } from '@/lib/security/rateLimiter'

export const dynamic = 'force-dynamic'

// Confirming starts the gap analysis (an AI call), and the placement and domain names are sent to the AI.
export const POST = route(
  {
    name: 'reports.confirm',
    auth: 'user',
    params: reportIdParams,
    body: confirmReportSchema,
    rateLimit: aiRouteLimits('reports.confirm'),
  },
  async ({ user, supabase, params, body }) => {
    const values = {
      ...body.values,
      ...sanitizeFieldsForLLM({ placement: body.values.placement }),
      domainResults: body.values.domainResults.map((domain, index) => ({
        ...domain,
        domain: sanitizeForLLM(domain.domain, `domainResults.${index}.domain`),
        ...sanitizeFieldsForLLM({ placement: domain.placement }),
      })),
    }
    return ok(await confirmReport(supabase, user.id, params.reportId, values))
  },
)
