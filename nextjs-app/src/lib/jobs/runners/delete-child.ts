import { z } from 'zod'
import { deleteChildData } from '@/lib/children/delete-child'
import { uuid } from '@/lib/schemas/common'
import type { JobRunner } from '../context'

const inputSchema = z.object({ childId: uuid }).passthrough()

/**
 * Permanently deletes a child. The job row has child_id = null so it survives the cascade
 * and the parent's browser can still read the final status (docs/specs/02 §4.5).
 */
export const runDeleteChild: JobRunner = async ({ job, setProgress }) => {
  const { childId } = inputSchema.parse(job.input)

  await deleteChildData({
    userId: job.user_id,
    childId,
    onProgress: setProgress,
  })
  return {}
}
