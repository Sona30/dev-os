import { ok } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { completeUploadSchema, uploadIdParams } from '@/lib/schemas/uploads'
import { completeUpload } from '@/lib/uploads/uploads.service'

export const dynamic = 'force-dynamic'

export const POST = route(
  {
    name: 'uploads.complete',
    auth: 'user',
    params: uploadIdParams,
    body: completeUploadSchema,
    rateLimit: { windowSeconds: 60, max: 60 },
  },
  async ({ supabase, params }) => ok(await completeUpload(supabase, params.uploadId)),
)
