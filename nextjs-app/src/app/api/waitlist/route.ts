import { z } from 'zod'
import { noContent } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { AppError } from '@/lib/errors/app-error'
import { recordUsage } from '@/lib/usage/record'

export const dynamic = 'force-dynamic'

// "Notify me when plans are available" — the only subscription field a parent may change (set_waitlist_opt_in RPC).
export const POST = route(
  { name: 'waitlist.set', auth: 'user', body: z.object({ optIn: z.boolean() }).strict() },
  async ({ user, supabase, body }) => {
    const { error } = await supabase.rpc('set_waitlist_opt_in', { p_value: body.optIn })
    if (error) throw new AppError('INTERNAL', { cause: error })
    if (body.optIn) await recordUsage({ userId: user.id, event: 'waitlist.optin' })
    return noContent()
  },
)
