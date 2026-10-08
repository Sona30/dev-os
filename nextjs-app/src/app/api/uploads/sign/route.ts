import { ok } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { signUploadsSchema } from '@/lib/schemas/uploads'
import { signUploads } from '@/lib/uploads/uploads.service'
import { RATE_LIMITS } from '@/lib/security/rateLimiter'

export const dynamic = 'force-dynamic'

export const POST = route(
  {
    name: 'uploads.sign',
    auth: 'user',
    body: signUploadsSchema,
    rateLimit: [{ action: 'uploads.sign', windowSeconds: 60, max: 20 }, RATE_LIMITS.uploadsDaily],
  },
  async ({ user, supabase, body }) => ok({ uploads: await signUploads(supabase, user.id, body) }),
)
