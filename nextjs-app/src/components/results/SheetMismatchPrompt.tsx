'use client'

import { useMutation } from '@tanstack/react-query'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import type { Submission } from '@/components/results/SheetPhotoUpload'
import { ApiError, apiFetch } from '@/lib/client/api'

interface SheetMismatchPromptProps {
  worksheetId: string
  readSheetId: string | null
  expectedSheetId: string
  submission: Submission
  onResubmitted: (submission: Submission) => void
  onRetake: () => void
}

/**
 * We couldn't match the photo to the printed Sheet ID. The parent decides: it is that sheet, just check the
 * answers (we then can't tie them to skills), or retake the photo (docs/specs/09 §1).
 */
export function SheetMismatchPrompt({
  worksheetId,
  readSheetId,
  expectedSheetId,
  submission,
  onResubmitted,
  onRetake,
}: SheetMismatchPromptProps) {
  const resubmit = useMutation({
    mutationFn: (attributeSkills: boolean) =>
      apiFetch<{ jobId: string }>(`/api/worksheets/${worksheetId}/submissions`, {
        method: 'POST',
        body: { uploadIds: submission.uploadIds, readAloud: submission.readAloud, confirmSheet: true, attributeSkills },
      }),
    onSuccess: ({ jobId }) => onResubmitted({ ...submission, jobId }),
  })

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-h5">Is this photo of the right sheet?</h2>
      <p className="max-w-prose text-body text-text-secondary">
        {readSheetId
          ? `We read the Sheet ID in the photo as ${readSheetId}, but your worksheet is ${expectedSheetId}.`
          : `We couldn’t read the Sheet ID in the photo. Your worksheet is ${expectedSheetId}.`}
      </p>
      {resubmit.isError ? (
        <Alert tone="danger">
          {resubmit.error instanceof ApiError ? resubmit.error.message : 'We couldn’t send that. Please try again.'}
        </Alert>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button loading={resubmit.isPending && resubmit.variables === true} onClick={() => resubmit.mutate(true)}>
          Yes, it’s sheet {expectedSheetId}
        </Button>
        <Button
          variant="secondary"
          loading={resubmit.isPending && resubmit.variables === false}
          onClick={() => resubmit.mutate(false)}
        >
          Just check the answers
        </Button>
        <Button variant="ghost" onClick={onRetake}>
          Retake the photo
        </Button>
      </div>
      <p className="text-caption text-text-secondary">
        If we only check the answers, we can’t tell which skills they belong to, so the next worksheet won’t change.
      </p>
    </Card>
  )
}
