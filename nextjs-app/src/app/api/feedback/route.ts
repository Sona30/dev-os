import { created } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { saveFeedback } from '@/lib/results/results.service'
import { feedbackSchema } from '@/lib/schemas/feedback'

export const dynamic = 'force-dynamic'

export const POST = route(
  { name: 'feedback.save', auth: 'user', body: feedbackSchema },
  async ({ user, supabase, body }) => {
    await saveFeedback(supabase, user.id, body)
    return created({ ok: true })
  },
)
