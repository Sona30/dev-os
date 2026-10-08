'use client'

import { useState } from 'react'
import { PhotoTips } from '@/components/results/PhotoTips'
import { UploadPanel } from '@/components/uploads/UploadPanel'
import { Alert } from '@/components/ui/Alert'
import { apiFetch } from '@/lib/client/api'
import { track } from '@/lib/client/track'

export interface Submission {
  jobId: string
  uploadIds: string[]
  readAloud: boolean
}

interface SheetPhotoUploadProps {
  childId: string
  worksheetId: string
  sheetId: string
  readAloudDefault: boolean
  /** A message to show above the picker, for example retake advice after a photo was too dark. */
  notice?: string | null
  onSubmitted: (submission: Submission) => void
}

/** Photograph the finished sheet and send it for checking. */
export function SheetPhotoUpload({
  childId,
  worksheetId,
  sheetId,
  readAloudDefault,
  notice,
  onSubmitted,
}: SheetPhotoUploadProps) {
  const [readAloud, setReadAloud] = useState(readAloudDefault)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-h5">Add a photo of the finished sheet</h2>
        <p className="max-w-prose text-body text-text-secondary">
          Sheet {sheetId}. We’ll read your child’s answers and ask you about anything we can’t make out.
        </p>
      </div>

      {notice ? <Alert tone="warning">{notice}</Alert> : null}
      <PhotoTips />

      <div className="flex max-w-prose items-start gap-3">
        <input
          id="results-read-aloud"
          type="checkbox"
          checked={readAloud}
          onChange={(event) => setReadAloud(event.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
        />
        <label htmlFor="results-read-aloud" className="text-body text-text-primary">
          I read the questions aloud. We’ll keep this sheet out of the reading level so it stays accurate.
        </label>
      </div>

      <UploadPanel
        childId={childId}
        kind="completed_sheet"
        accept="image/*"
        capture="environment"
        dropzoneLabel="Take a photo, or choose one"
        dropzoneHint="JPEG, PNG or iPhone photos. Up to 4 pages."
        submitLabel="Check this sheet"
        onUploaded={async (uploadIds) => {
          const { jobId } = await apiFetch<{ jobId: string }>(`/api/worksheets/${worksheetId}/submissions`, {
            method: 'POST',
            body: { uploadIds, readAloud },
          })
          track('photo_uploaded', { childId })
          onSubmitted({ jobId, uploadIds, readAloud })
        }}
      />
    </div>
  )
}
