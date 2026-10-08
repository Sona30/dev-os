import { apiFetch, ApiError } from '@/lib/client/api'
import { createBrowserClient } from '@/lib/supabase/browser'
import type { PreparedImage, UploadKind } from './prepare'

const MAX_PARALLEL = 3
const PUT_RETRIES = 2
const RETRY_DELAYS_MS = [500, 1500]

interface SignedSlot {
  uploadId: string
  path: string
  token: string
}

export interface UploadedImage {
  uploadId: string
  qualityScore: number | null
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function putWithRetry(slot: SignedSlot, image: PreparedImage): Promise<void> {
  const storage = createBrowserClient().storage.from('uploads')
  let lastError: unknown
  for (let attempt = 0; attempt <= PUT_RETRIES; attempt++) {
    const { error } = await storage.uploadToSignedUrl(slot.path, slot.token, image.file, {
      contentType: image.file.type,
    })
    if (!error) return
    lastError = error
    if (attempt < PUT_RETRIES) await sleep(RETRY_DELAYS_MS[attempt] ?? 1500)
  }
  throw lastError
}

/** Runs `worker` over `items` with at most `limit` in flight, preserving result order. */
async function mapWithLimit<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length)
  let next = 0
  async function lane() {
    while (next < items.length) {
      const index = next++
      results[index] = await worker(items[index] as T, index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane))
  return results
}

export interface UploadCallbacks {
  /** Called as each image moves through "uploading" → done. */
  onStart?: (index: number) => void
  onDone?: (index: number, uploaded: UploadedImage) => void
  onError?: (index: number, error: unknown) => void
}

/**
 * sign → send bytes straight to Storage (3 at a time, 2 retries each) → confirm.
 * Images that fail are reported through onError and their unfinished slots are deleted (best effort).
 * Resolves with one entry per image: the upload, or null if that image failed.
 */
export async function uploadPrepared(
  params: { childId: string; kind: UploadKind; images: PreparedImage[] },
  callbacks: UploadCallbacks = {},
): Promise<Array<UploadedImage | null>> {
  const { childId, kind, images } = params

  const { uploads } = await apiFetch<{ uploads: SignedSlot[] }>('/api/uploads/sign', {
    method: 'POST',
    body: {
      childId,
      kind,
      files: images.map((image) => ({ name: image.file.name, mime: image.file.type, bytes: image.file.size })),
    },
  })

  return mapWithLimit(images, MAX_PARALLEL, async (image, index) => {
    const slot = uploads[index]
    if (!slot) return null
    callbacks.onStart?.(index)
    try {
      await putWithRetry(slot, image)
      const done = await apiFetch<UploadedImage>(`/api/uploads/${slot.uploadId}/complete`, {
        method: 'POST',
        body: { width: image.width, height: image.height },
      })
      callbacks.onDone?.(index, done)
      return done
    } catch (error) {
      callbacks.onError?.(index, error)
      // Free the slot so it does not count towards the open-upload limit.
      apiFetch(`/api/uploads/${slot.uploadId}`, { method: 'DELETE' }).catch(() => undefined)
      return null
    }
  })
}

export function uploadErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return 'The upload didn’t finish. Please try again.'
}
