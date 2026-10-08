import { ok } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { uploadIdParams } from '@/lib/schemas/uploads'
import { getUploadUrl } from '@/lib/uploads/uploads.service'

export const dynamic = 'force-dynamic'

export const GET = route(
  { name: 'uploads.url', auth: 'user', params: uploadIdParams },
  async ({ supabase, params }) => ok(await getUploadUrl(supabase, params.uploadId)),
)
