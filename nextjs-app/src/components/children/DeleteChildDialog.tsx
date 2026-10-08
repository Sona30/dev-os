'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { JobProgress } from '@/components/jobs/JobProgress'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { childrenKey, useDeleteChild } from '@/hooks/use-children'
import { useJob, useRetryJob } from '@/hooks/use-job'
import { ApiError } from '@/lib/client/api'

interface DeleteChildDialogProps {
  childId: string
  nickname: string
}

/** Danger zone: typed confirmation, then a deletion job (photos, worksheets, progress) with live progress (FR-17). */
export function DeleteChildDialog({ childId, nickname }: DeleteChildDialogProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const deleteChild = useDeleteChild(childId)
  const retryJob = useRetryJob()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)

  const { job, connectionLost, recheck } = useJob(jobId, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: childrenKey })
      router.replace('/children')
      router.refresh()
    },
  })

  const deleting = jobId !== null && job?.status !== 'failed'

  function close() {
    // Closing while the job runs is not allowed: the deletion cannot be half-watched and then forgotten.
    if (deleteChild.isPending || deleting) return
    setOpen(false)
    setTyped('')
    setJobId(null)
    deleteChild.reset()
  }

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Delete profile
      </Button>
      <Dialog
        open={open}
        onClose={close}
        dismissible={!deleteChild.isPending && !deleting}
        title={`Delete ${nickname}’s profile?`}
        description="This permanently deletes the profile, worksheets, photos and progress. It can’t be undone."
      >
        {jobId ? (
          <div className="flex flex-col gap-4">
            <JobProgress
              type="delete_child"
              job={job}
              connectionLost={connectionLost}
              onRecheck={recheck}
              onRetry={() => retryJob.mutate(jobId)}
              retrying={retryJob.isPending}
            />
            {job?.status === 'failed' ? (
              <div className="flex justify-end">
                <Button variant="secondary" onClick={close}>
                  Close
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              deleteChild.mutate(typed, { onSuccess: ({ jobId: startedJobId }) => setJobId(startedJobId) })
            }}
          >
            {deleteChild.isError ? (
              <Alert tone="danger">
                {deleteChild.error instanceof ApiError
                  ? deleteChild.error.message
                  : 'We couldn’t delete the profile. Please try again.'}
              </Alert>
            ) : null}
            <Field id="delete-confirm" label={`Type “${nickname}” to confirm`}>
              <Input autoComplete="off" value={typed} onChange={(event) => setTyped(event.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={close} disabled={deleteChild.isPending}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" disabled={typed !== nickname} loading={deleteChild.isPending}>
                {deleteChild.isPending ? 'Starting…' : 'Delete permanently'}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  )
}
