// Storage object paths: {userId}/{childId}/{kind}/{uploadId}.{ext} (docs/specs/03 §2).
// The first segment is the owner id, which the Storage RLS policies match against auth.uid().

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heic',
}

export function extensionFor(mime: string): string {
  return EXTENSIONS[mime] ?? 'bin'
}

export function buildUploadPath(params: {
  userId: string
  childId: string
  kind: 'report_page' | 'completed_sheet' | 'item_crop'
  uploadId: string
  mime: string
}): string {
  const { userId, childId, kind, uploadId, mime } = params
  return `${userId}/${childId}/${kind}/${uploadId}.${extensionFor(mime)}`
}
