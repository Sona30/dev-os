import { noContent } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { flagKeyParams, flagKeySchema } from '@/lib/schemas/worksheets'
import { flagWrongKey } from '@/lib/worksheets/worksheets.service'

export const dynamic = 'force-dynamic'

export const POST = route(
  { name: 'worksheets.flag-key', auth: 'user', params: flagKeyParams, body: flagKeySchema },
  async ({ user, supabase, params }) => {
    await flagWrongKey(supabase, user.id, params.worksheetId, params.itemId)
    return noContent()
  },
)
