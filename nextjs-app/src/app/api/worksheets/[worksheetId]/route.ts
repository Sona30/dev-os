import { ok } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { worksheetIdParams } from '@/lib/schemas/worksheets'
import { getWorksheetDetail } from '@/lib/worksheets/worksheets.service'

export const dynamic = 'force-dynamic'

export const GET = route(
  { name: 'worksheets.get', auth: 'user', params: worksheetIdParams },
  async ({ supabase, params }) => ok(await getWorksheetDetail(supabase, params.worksheetId)),
)
