import { accepted } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { worksheetIdParams } from '@/lib/schemas/worksheets'
import { regenerateWorksheet } from '@/lib/worksheets/worksheets.service'
import { aiRouteLimits } from '@/lib/security/rateLimiter'

export const dynamic = 'force-dynamic'

export const POST = route(
  {
    name: 'worksheets.regenerate',
    auth: 'user',
    params: worksheetIdParams,
    rateLimit: aiRouteLimits('worksheets.regenerate'),
  },
  async ({ user, supabase, params }) => accepted(await regenerateWorksheet(supabase, user.id, params.worksheetId)),
)
