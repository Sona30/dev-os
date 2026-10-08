'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { ApiError, apiFetch } from '@/lib/client/api'

/**
 * "Delete all photos": removes every report page and worksheet photo now, instead of waiting for the 30-day
 * automatic deletion. Worksheets, results and progress stay (FR-17).
 */
export function DeleteImagesCard({ childId, nickname }: { childId: string; nickname: string }) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)

  const purge = useMutation({
    mutationFn: () => apiFetch(`/api/children/${childId}/purge-images`, { method: 'POST' }),
    onSuccess: () => {
      setOpen(false)
      setDone(true)
    },
  })

  return (
    <Card className="flex flex-col gap-4">
      <p className="max-w-prose text-body text-text-secondary">
        Photos of reports and finished worksheets are deleted automatically after 30 days. You can remove {nickname}’s
        photos right now. Worksheets, results and progress are kept.
      </p>
      {done ? <Alert tone="success">All photos have been deleted.</Alert> : null}
      <div>
        <Button
          variant="secondary"
          onClick={() => {
            purge.reset()
            setDone(false)
            setOpen(true)
          }}
        >
          Delete all photos
        </Button>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!purge.isPending}
        title={`Delete all of ${nickname}’s photos?`}
        description="This removes every uploaded report page and worksheet photo. It can’t be undone."
      >
        <div className="flex flex-col gap-4">
          {purge.isError ? (
            <Alert tone="danger">
              {purge.error instanceof ApiError ? purge.error.message : 'We couldn’t delete the photos. Please try again.'}
            </Alert>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={purge.isPending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={purge.isPending} onClick={() => purge.mutate()}>
              Delete all photos
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  )
}
