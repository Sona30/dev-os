import { noContent } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { uploadIdParams } from '@/lib/schemas/uploads'
import { deleteUpload } from '@/lib/uploads/uploads.service'

export const dynamic = 'force-dynamic'

export const DELETE = route(
  { name: 'uploads.delete', auth: 'user', params: uploadIdParams },
  async ({ supabase, params }) => {
    await deleteUpload(supabase, params.uploadId)
    return noContent()
  },
)
