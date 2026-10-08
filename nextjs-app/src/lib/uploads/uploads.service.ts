import 'server-only'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireChild } from '@/lib/children/children.service'
import { MAX_UPLOAD_BYTES, SIGNED_URL_TTL_SECONDS, UPLOAD_RETENTION_DAYS } from '@/lib/constants'
import { AppError } from '@/lib/errors/app-error'
import { mimeMatches, sniffMime } from '@/lib/images/sniff'
import type { SignUploadsInput } from '@/lib/schemas/uploads'
import { validateFileUpload } from '@/lib/security/inputValidator'
import { assertSignedUrlsEnabled, createReadUrl } from '@/lib/storage/signed-urls'
import { createServiceClient } from '@/lib/supabase/service'
import { buildUploadPath } from './paths'
import { computeQualityScore } from './quality'

const BUCKET = 'uploads'
const MAX_OPEN_SLOTS_PER_USER = 20
const OPEN_SLOT_WINDOW_MS = 60 * 60 * 1000

interface UploadRow {
  id: string
  user_id: string
  child_id: string
  kind: 'report_page' | 'completed_sheet' | 'item_crop'
  storage_path: string
  mime: string
  bytes: number
  confirmed_uploaded: boolean
  quality_score: number | null
  deleted_at: string | null
}

const COLUMNS = 'id, user_id, child_id, kind, storage_path, mime, bytes, confirmed_uploaded, quality_score, deleted_at'

export interface SignedUpload {
  uploadId: string
  path: string
  uploadUrl: string
  token: string
  expiresAt: string
}

/**
 * Creates upload slots and signed upload URLs. The browser then sends the bytes straight to Storage;
 * the server never proxies image data (docs/specs/03 §1).
 */
export async function signUploads(
  supabase: SupabaseClient,
  userId: string,
  input: SignUploadsInput,
): Promise<SignedUpload[]> {
  assertSignedUrlsEnabled()
  const child = await requireChild(supabase, input.childId)

  // Extension (blocklist, then allowlist) → MIME type → size. The real bytes are sniffed again in completeUpload().
  for (const file of input.files) validateFileUpload(file)

  if (input.kind === 'completed_sheet') {
    const { data, error } = await supabase
      .from('cycles')
      .select('id')
      .eq('child_id', child.id)
      .eq('status', 'ready')
      .limit(1)
    if (error) throw new AppError('INTERNAL', { cause: error })
    if ((data ?? []).length === 0) {
      throw new AppError('CONFLICT', { message: 'There is no printed worksheet waiting for a photo yet.' })
    }
  }

  const service = createServiceClient()

  const openSince = new Date(Date.now() - OPEN_SLOT_WINDOW_MS).toISOString()
  const { count, error: countError } = await service
    .from('uploads')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('confirmed_uploaded', false)
    .is('deleted_at', null)
    .gt('created_at', openSince)
  if (countError) throw new AppError('INTERNAL', { cause: countError })
  if ((count ?? 0) + input.files.length > MAX_OPEN_SLOTS_PER_USER) {
    throw new AppError('RATE_LIMITED', {
      message: 'You have a lot of unfinished uploads. Please finish or wait a few minutes.',
      details: { retryAfterSeconds: 60 },
    })
  }

  const expiresAt = new Date(Date.now() + UPLOAD_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const slots = input.files.map((file, index) => {
    const uploadId = randomUUID()
    return {
      uploadId,
      pageNo: index + 1,
      file,
      path: buildUploadPath({ userId, childId: child.id, kind: input.kind, uploadId, mime: file.mime }),
    }
  })

  const { error: insertError } = await service.from('uploads').insert(
    slots.map((slot) => ({
      id: slot.uploadId,
      user_id: userId,
      child_id: child.id,
      kind: input.kind,
      storage_path: slot.path,
      mime: slot.file.mime,
      bytes: slot.file.bytes,
      page_no: slot.pageNo,
      expires_at: expiresAt,
    })),
  )
  if (insertError) throw new AppError('INTERNAL', { cause: insertError })

  const signed: SignedUpload[] = []
  for (const slot of slots) {
    const { data, error } = await service.storage.from(BUCKET).createSignedUploadUrl(slot.path)
    if (error || !data) {
      await service
        .from('uploads')
        .delete()
        .in(
          'id',
          slots.map((item) => item.uploadId),
        )
      throw new AppError('INTERNAL', { cause: error })
    }
    signed.push({
      uploadId: slot.uploadId,
      path: slot.path,
      uploadUrl: data.signedUrl,
      token: data.token,
      // Supabase signed upload URLs are valid for two hours.
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    })
  }
  return signed
}

async function findOwnedUpload(supabase: SupabaseClient, uploadId: string): Promise<UploadRow> {
  const { data, error } = await supabase.from('uploads').select(COLUMNS).eq('id', uploadId).maybeSingle()
  if (error) throw new AppError('INTERNAL', { cause: error })
  if (!data || (data as UploadRow).deleted_at) throw new AppError('NOT_FOUND')
  return data as UploadRow
}

async function discardUpload(service: SupabaseClient, row: UploadRow): Promise<void> {
  await service.storage.from(BUCKET).remove([row.storage_path])
  await service.from('uploads').delete().eq('id', row.id)
}

/**
 * Called after the browser finishes sending bytes. Confirms the object exists, checks that its real type
 * matches what was claimed, scores its quality, and marks the slot as uploaded.
 */
export async function completeUpload(
  supabase: SupabaseClient,
  uploadId: string,
): Promise<{ uploadId: string; qualityScore: number | null }> {
  const row = await findOwnedUpload(supabase, uploadId)
  if (row.confirmed_uploaded) return { uploadId: row.id, qualityScore: row.quality_score }

  const service = createServiceClient()
  const { data: blob, error: downloadError } = await service.storage.from(BUCKET).download(row.storage_path)
  if (downloadError || !blob) {
    throw new AppError('CONFLICT', { message: 'That upload didn’t finish. Please try again.' })
  }

  const buffer = Buffer.from(await blob.arrayBuffer())
  if (buffer.length > MAX_UPLOAD_BYTES) {
    await discardUpload(service, row)
    throw new AppError('FILE_TOO_LARGE')
  }

  const sniffed = sniffMime(new Uint8Array(buffer.subarray(0, 16)))
  if (!mimeMatches(row.mime, sniffed)) {
    await discardUpload(service, row)
    throw new AppError('UNSUPPORTED_MEDIA')
  }

  // HEIC cannot be decoded on the server; the browser converts it before upload, so it is rare here.
  let qualityScore: number | null = null
  if (sniffed !== 'image/heic') {
    try {
      qualityScore = await computeQualityScore(buffer)
    } catch {
      // An image we cannot decode at all is not a usable upload.
      await discardUpload(service, row)
      throw new AppError('UNSUPPORTED_MEDIA')
    }
  }

  const { error: updateError } = await service
    .from('uploads')
    .update({ confirmed_uploaded: true, quality_score: qualityScore, bytes: buffer.length })
    .eq('id', row.id)
  if (updateError) throw new AppError('INTERNAL', { cause: updateError })

  return { uploadId: row.id, qualityScore }
}

/** Short-lived read URL for a stored image (crops, thumbnails). */
export async function getUploadUrl(
  supabase: SupabaseClient,
  uploadId: string,
): Promise<{ url: string; expiresAt: string }> {
  const row = await findOwnedUpload(supabase, uploadId)
  if (!row.confirmed_uploaded) throw new AppError('NOT_FOUND')

  const url = await createReadUrl(createServiceClient(), BUCKET, row.storage_path, SIGNED_URL_TTL_SECONDS)
  return { url, expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString() }
}

/** Deletes the image now (parent-initiated, FR-17). */
export async function deleteUpload(supabase: SupabaseClient, uploadId: string): Promise<void> {
  const row = await findOwnedUpload(supabase, uploadId)
  await discardUpload(createServiceClient(), row)
}
