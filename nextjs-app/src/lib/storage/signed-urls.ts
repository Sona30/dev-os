import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError } from '@/lib/errors/app-error'

// The single place short-lived links to private files are issued. Having one door means an incident can be
// contained with one switch: set DISABLE_SIGNED_URLS=true and no new link is created (docs/specs/13 §6).

export function signedUrlsDisabled(): boolean {
  return process.env.DISABLE_SIGNED_URLS === 'true'
}

export function assertSignedUrlsEnabled(): void {
  if (signedUrlsDisabled()) throw new AppError('TEMPORARILY_UNAVAILABLE')
}

/** A time-limited link to read a private file. */
export async function createReadUrl(
  service: SupabaseClient,
  bucket: 'uploads' | 'worksheets',
  path: string,
  ttlSeconds: number,
): Promise<string> {
  assertSignedUrlsEnabled()
  const { data, error } = await service.storage.from(bucket).createSignedUrl(path, ttlSeconds)
  if (error || !data) throw new AppError('INTERNAL', { cause: error ?? new Error('no signed URL returned') })
  return data.signedUrl
}
