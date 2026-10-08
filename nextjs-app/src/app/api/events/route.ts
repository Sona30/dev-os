import { noContent } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { requireChild } from '@/lib/children/children.service'
import { clientEventSchema } from '@/lib/schemas/events'
import { recordUsage } from '@/lib/usage/record'

export const dynamic = 'force-dynamic'

export const POST = route(
  {
    name: 'events.record',
    auth: 'user',
    body: clientEventSchema,
    rateLimit: { windowSeconds: 60, max: 60 },
  },
  async ({ user, supabase, body }) => {
    // A child id is only recorded if it belongs to this parent.
    if (body.childId) await requireChild(supabase, body.childId)
    const event = body.event === 'client.error' && body.component ? `client.error:${body.component}` : body.event
    await recordUsage({ userId: user.id, childId: body.childId ?? null, event })
    return noContent()
  },
)
