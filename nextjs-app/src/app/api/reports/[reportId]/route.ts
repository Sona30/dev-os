import { ok } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { reportIdParams } from '@/lib/schemas/reports'
import { getReport } from '@/lib/reports/reports.service'

export const dynamic = 'force-dynamic'

export const GET = route(
  { name: 'reports.get', auth: 'user', params: reportIdParams },
  async ({ supabase, params }) => ok(await getReport(supabase, params.reportId)),
)
