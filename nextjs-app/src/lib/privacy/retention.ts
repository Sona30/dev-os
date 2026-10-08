import type { SupabaseClient } from '@supabase/supabase-js'
import { listAllFiles, listFolders, removeObjects } from '@/lib/storage/objects'

// Data retention (docs/specs/13 §4). Uploaded images are kept for 30 days and then removed; children's
// structured progress stays until the parent deletes the profile. These functions are used by the nightly
// cleanup function and by "delete all photos". Every step is safe to repeat after a failure.

const BATCH = 200
const MAX_BATCHES = 25 // bounds one run; the rest is picked up the next night
const AUDIT_DAYS = 7 // deleted-image rows are kept this long as a record, then removed
const ABANDONED_SLOT_MS = 60 * 60 * 1000
const RATE_LIMIT_KEEP_DAYS = 2
const SWEEP_FOLDER_LIMIT = 500

export interface RetentionReport {
  imagesDeleted: number
  cropsDeleted: number
  abandonedSlots: number
  auditRowsRemoved: number
  rateLimitRows: number
}

interface UploadRow {
  id: string
  kind: 'report_page' | 'completed_sheet' | 'item_crop'
  storage_path: string
}

/**
 * Removes files from Storage, then records it in the database. If Storage fails, nothing is marked, so the
 * next run tries again. Returns how many rows were finished.
 */
async function removeAndMark(service: SupabaseClient, rows: UploadRow[], nowIso: string): Promise<{ images: number; crops: number }> {
  if (rows.length === 0) return { images: 0, crops: 0 }
  await removeObjects(service.storage.from('uploads'), rows.map((row) => row.storage_path))

  const cropRows = rows.filter((row) => row.kind === 'item_crop')
  if (cropRows.length > 0) {
    // The review queue must not point at a file that no longer exists.
    const { error: clearError } = await service
      .from('graded_items')
      .update({ crop_path: null })
      .in('crop_path', cropRows.map((row) => row.storage_path))
    if (clearError) throw clearError
    const { error: cropDeleteError } = await service.from('uploads').delete().in('id', cropRows.map((row) => row.id))
    if (cropDeleteError) throw cropDeleteError
  }

  const originals = rows.filter((row) => row.kind !== 'item_crop')
  if (originals.length > 0) {
    const { error } = await service.from('uploads').update({ deleted_at: nowIso }).in('id', originals.map((row) => row.id))
    if (error) throw error
  }
  return { images: originals.length, crops: cropRows.length }
}

/** The nightly sweep: expired images, abandoned upload slots, old audit rows and old rate-limit counters. */
export async function purgeExpired(service: SupabaseClient, now = new Date()): Promise<RetentionReport> {
  const nowIso = now.toISOString()
  const report: RetentionReport = { imagesDeleted: 0, cropsDeleted: 0, abandonedSlots: 0, auditRowsRemoved: 0, rateLimitRows: 0 }

  // 1. Images past their retention date.
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data, error } = await service
      .from('uploads')
      .select('id, kind, storage_path')
      .lt('expires_at', nowIso)
      .is('deleted_at', null)
      .eq('confirmed_uploaded', true)
      .limit(BATCH)
    if (error) throw error
    const rows = (data ?? []) as UploadRow[]
    if (rows.length === 0) break
    const done = await removeAndMark(service, rows, nowIso)
    report.imagesDeleted += done.images
    report.cropsDeleted += done.crops
  }

  // 2. Upload slots that were never completed (the parent closed the tab) and the files they may hold.
  const abandonedBefore = new Date(now.getTime() - ABANDONED_SLOT_MS).toISOString()
  const { data: abandoned, error: abandonedError } = await service
    .from('uploads')
    .select('id, kind, storage_path')
    .eq('confirmed_uploaded', false)
    .lt('created_at', abandonedBefore)
    .limit(BATCH * 5)
  if (abandonedError) throw abandonedError
  const slots = (abandoned ?? []) as UploadRow[]
  if (slots.length > 0) {
    // A slot may have no file at all; removing a missing object is not an error worth stopping for.
    await service.storage.from('uploads').remove(slots.map((slot) => slot.storage_path))
    const { error } = await service.from('uploads').delete().in('id', slots.map((slot) => slot.id))
    if (error) throw error
    report.abandonedSlots = slots.length
  }

  // 3. Audit rows for images deleted more than a week ago.
  const auditBefore = new Date(now.getTime() - AUDIT_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: audit, error: auditError } = await service.from('uploads').delete().lt('deleted_at', auditBefore).select('id')
  if (auditError) throw auditError
  report.auditRowsRemoved = audit?.length ?? 0

  // 4. Old rate-limit events (the longest window is one day, so anything older than two can go).
  const limitBefore = new Date(now.getTime() - RATE_LIMIT_KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { count: counters, error: counterError } = await service
    .from('rate_limit_events')
    .delete({ count: 'exact' })
    .lt('created_at', limitBefore)
  if (counterError) throw counterError
  report.rateLimitRows = counters ?? 0

  return report
}

/**
 * Removes every stored image for one child immediately ("delete all photos"). Progress, worksheets and
 * results are kept. Returns how many images were removed.
 */
export async function purgeChildImages(service: SupabaseClient, childId: string): Promise<number> {
  const nowIso = new Date().toISOString()
  let removed = 0
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data, error } = await service
      .from('uploads')
      .select('id, kind, storage_path')
      .eq('child_id', childId)
      .is('deleted_at', null)
      .limit(BATCH)
    if (error) throw error
    const rows = (data ?? []) as UploadRow[]
    if (rows.length === 0) break
    // If Storage fails we stop before marking anything, so nothing is reported deleted that still exists.
    await removeObjects(service.storage.from('uploads'), rows.map((row) => row.storage_path))
    const crops = rows.filter((row) => row.kind === 'item_crop')
    if (crops.length > 0) {
      await service.from('graded_items').update({ crop_path: null }).in('crop_path', crops.map((row) => row.storage_path))
      await service.from('uploads').delete().in('id', crops.map((row) => row.id))
    }
    const originals = rows.filter((row) => row.kind !== 'item_crop')
    if (originals.length > 0) {
      const { error: markError } = await service.from('uploads').update({ deleted_at: nowIso }).in('id', originals.map((row) => row.id))
      if (markError) throw markError
    }
    removed += rows.length
  }
  return removed
}

/**
 * Weekly clean-up of files whose owner or child no longer exists in the database — for example if a user was
 * removed by hand in the Supabase dashboard. Looks at a bounded number of folders per run.
 */
export async function sweepOrphans(service: SupabaseClient): Promise<{ filesRemoved: number }> {
  let filesRemoved = 0
  for (const bucket of ['uploads', 'worksheets'] as const) {
    const storage = service.storage.from(bucket)
    const userFolders = await listFolders(storage, '', SWEEP_FOLDER_LIMIT)
    if (userFolders.length === 0) continue

    const { data: users, error } = await service.from('profiles').select('id').in('id', userFolders)
    if (error) throw error
    const knownUsers = new Set(((users ?? []) as Array<{ id: string }>).map((row) => row.id))

    for (const userId of userFolders) {
      if (!knownUsers.has(userId)) {
        const files = await listAllFiles(storage, userId)
        await removeObjects(storage, files)
        filesRemoved += files.length
        continue
      }
      const childFolders = await listFolders(storage, userId, SWEEP_FOLDER_LIMIT)
      if (childFolders.length === 0) continue
      const { data: children, error: childError } = await service.from('children').select('id').in('id', childFolders)
      if (childError) throw childError
      const knownChildren = new Set(((children ?? []) as Array<{ id: string }>).map((row) => row.id))
      for (const folder of childFolders) {
        if (knownChildren.has(folder)) continue
        const files = await listAllFiles(storage, `${userId}/${folder}`)
        await removeObjects(storage, files)
        filesRemoved += files.length
      }
    }
  }
  return { filesRemoved }
}
