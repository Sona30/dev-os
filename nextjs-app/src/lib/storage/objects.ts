import type { SupabaseClient } from '@supabase/supabase-js'

// Helpers for working with many Storage objects at once. Storage lists one folder level at a time, so removing
// "everything under a prefix" needs a recursive walk.

export type StorageFileApi = ReturnType<SupabaseClient['storage']['from']>

const LIST_PAGE_SIZE = 100
const REMOVE_BATCH_SIZE = 100

/** Every object path under a prefix (use '' for the whole bucket's top level). Folders have no id; files do. */
export async function listAllFiles(storage: StorageFileApi, prefix: string): Promise<string[]> {
  const files: string[] = []
  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await storage.list(prefix, { limit: LIST_PAGE_SIZE, offset })
    if (error) throw error
    if (!data || data.length === 0) break
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (!entry.id) files.push(...(await listAllFiles(storage, path)))
      else files.push(path)
    }
    if (data.length < LIST_PAGE_SIZE) break
  }
  return files
}

/** The first-level folder names under a prefix (user ids at the bucket root, child ids under a user). */
export async function listFolders(storage: StorageFileApi, prefix: string, limit: number): Promise<string[]> {
  const { data, error } = await storage.list(prefix, { limit })
  if (error) throw error
  return (data ?? []).filter((entry) => !entry.id).map((entry) => entry.name)
}

/** Removes objects in batches. Throws on the first failure so callers can retry later. */
export async function removeObjects(storage: StorageFileApi, paths: string[]): Promise<void> {
  for (let index = 0; index < paths.length; index += REMOVE_BATCH_SIZE) {
    const { error } = await storage.remove(paths.slice(index, index + REMOVE_BATCH_SIZE))
    if (error) throw error
  }
}
