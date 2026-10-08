import { accepted, ok } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { repaperSchema, worksheetIdParams } from '@/lib/schemas/worksheets'
import { repaperWorksheet } from '@/lib/worksheets/worksheets.service'

export const dynamic = 'force-dynamic'

export const POST = route(
  {
    name: 'worksheets.repaper',
    auth: 'user',
    params: worksheetIdParams,
    body: repaperSchema,
    rateLimit: { windowSeconds: 60, max: 10 },
  },
  async ({ user, supabase, params, body }) => {
    const result = await repaperWorksheet(supabase, user.id, params.worksheetId, body.paperSize)
    // 200 when the sheet is already on that paper size, 202 when new files are being built.
    return result ? accepted(result) : ok({ jobId: null })
  },
)
