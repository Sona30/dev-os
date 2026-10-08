import 'server-only'
import { AppError } from '@/lib/errors/app-error'
import { listAllFiles, removeObjects } from '@/lib/storage/objects'
import { createServiceClient } from '@/lib/supabase/service'

// Permanent deletion of a child and everything attached to it (FR-17).
// Idempotent: safe to re-run after a partial failure (docs/specs/02 §4.5).

const BUCKETS = ['uploads', 'worksheets'] as const

/**
 * Deletes all Storage objects and database rows for a child.
 * The caller MUST have verified that `userId` owns `childId` (the route does this with the user-scoped client).
 */
export async function deleteChildData(params: {
  userId: string
  childId: string
  /** Optional hook so a job can report 'removing_files' / 'removing_data'. */
  onProgress?: (step: 'removing_files' | 'removing_data') => Promise<void>
}): Promise<void> {
  const { userId, childId, onProgress } = params
  const service = createServiceClient()

  try {
    // Stop in-flight work first so runners notice the child is gone (error code CHILD_DELETED).
    const { error: jobsError } = await service
      .from('jobs')
      .update({ status: 'failed', error_code: 'CHILD_DELETED', error_message: 'This profile was deleted.' })
      .eq('child_id', childId)
      .in('status', ['queued', 'running'])
    if (jobsError) throw jobsError

    await onProgress?.('removing_files')
    for (const bucket of BUCKETS) {
      const storage = service.storage.from(bucket)
      const paths = await listAllFiles(storage, `${userId}/${childId}`)
      await removeObjects(storage, paths)
    }

    await onProgress?.('removing_data')
    // Every child-scoped table cascades from this delete.
    const { error: deleteError } = await service.from('children').delete().eq('id', childId).eq('user_id', userId)
    if (deleteError) throw deleteError

    // Cost history survives without any child identifier (usage_events.child_id has no foreign key).
    const { error: usageError } = await service
      .from('usage_events')
      .insert({ user_id: userId, event: 'child.deleted' })
    if (usageError) throw usageError
  } catch (error) {
    throw new AppError('INTERNAL', { cause: error })
  }
}
