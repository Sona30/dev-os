'use client'

import { useState } from 'react'
import { CoverNameTip } from '@/components/uploads/CoverNameTip'
import { FileDropzone } from '@/components/uploads/FileDropzone'
import { FileTile } from '@/components/uploads/FileTile'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { useUploader } from '@/hooks/use-uploader'
import type { UploadKind } from '@/lib/client/images/prepare'

interface UploadPanelProps {
  childId: string
  kind: UploadKind
  /** File picker filter, e.g. "image/*,application/pdf" for reports or "image/*" for sheet photos. */
  accept: string
  /** Open the rear camera on phones (sheet photos). */
  capture?: 'environment'
  dropzoneLabel: string
  dropzoneHint?: string
  submitLabel: string
  /** Called with the ids of every uploaded image once all uploads succeed. */
  onUploaded: (uploadIds: string[]) => void | Promise<void>
}

/**
 * Reusable "add files → check → upload" block for report pages (spec 06) and completed-sheet photos (spec 09).
 * It prepares files in the browser, shows each one, and uploads straight to private storage.
 */
export function UploadPanel({
  childId,
  kind,
  accept,
  capture,
  dropzoneLabel,
  dropzoneHint,
  submitLabel,
  onUploaded,
}: UploadPanelProps) {
  const uploader = useUploader({ childId, kind })
  const [failed, setFailed] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function submit() {
    setFailed(false)
    setSubmitError(null)
    const ids = await uploader.uploadAll()
    if (!ids) {
      setFailed(true)
      return
    }
    setFinishing(true)
    try {
      await onUploaded(ids)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Something went wrong. Please try again.')
    } finally {
      setFinishing(false)
    }
  }

  const atLimit = uploader.items.length >= uploader.maxFiles

  return (
    <div className="flex flex-col gap-4">
      <CoverNameTip subject={kind === 'report_page' ? 'report' : 'sheet'} />

      <FileDropzone
        accept={accept}
        capture={capture}
        label={dropzoneLabel}
        hint={dropzoneHint}
        disabled={atLimit || uploader.uploading || finishing}
        onFiles={uploader.addFiles}
      />

      {uploader.notice ? <Alert tone="info">{uploader.notice}</Alert> : null}

      {uploader.items.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Files to upload">
          {uploader.items.map((item) => (
            <FileTile
              key={item.id}
              item={item}
              onRemove={uploader.remove}
              onUseAnyway={uploader.useAnyway}
              onUseFirstPages={uploader.useFirstPages}
            />
          ))}
        </ul>
      ) : null}

      {submitError ? <Alert tone="danger">{submitError}</Alert> : null}

      {failed ? (
        <Alert tone="danger">Some files didn’t upload. Check the messages above and try again.</Alert>
      ) : null}

      <div>
        <Button
          onClick={submit}
          loading={uploader.uploading || finishing}
          disabled={!uploader.canUpload && !uploader.hasUploaded}
        >
          {uploader.uploading ? 'Uploading…' : finishing ? 'Working…' : submitLabel}
        </Button>
      </div>
    </div>
  )
}
