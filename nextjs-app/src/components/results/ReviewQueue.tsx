'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ReviewCard } from '@/components/results/ReviewCard'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { ApiError, apiFetch } from '@/lib/client/api'
import type { ReviewQueueDto } from '@/lib/grading/types'

interface ReviewQueueProps {
  cycleId: string
  onFinished: () => void
}

/** Work through the answers we weren't sure about. Nothing here counts until the parent has confirmed it. */
export function ReviewQueue({ cycleId, onFinished }: ReviewQueueProps) {
  const queryClient = useQueryClient()
  const queueKey = ['review-queue', cycleId] as const
  const queue = useQuery({
    queryKey: queueKey,
    queryFn: () => apiFetch<ReviewQueueDto>(`/api/cycles/${cycleId}/review-queue`),
    staleTime: 0,
  })

  const [skipped, setSkipped] = useState<string[]>([])
  const [cardError, setCardError] = useState<string | null>(null)
  const [confirmSkipOpen, setConfirmSkipOpen] = useState(false)

  const confirm = useMutation({
    mutationFn: (args: { id: string; answer: string; leftBlank: boolean }) =>
      apiFetch(`/api/graded-items/${args.id}/confirm`, {
        method: 'POST',
        body: { answer: args.answer, ...(args.leftBlank ? { status: 'blank' } : {}) },
      }),
    onSuccess: () => {
      setCardError(null)
      return queryClient.invalidateQueries({ queryKey: queueKey })
    },
    onError: (error) => setCardError(error instanceof ApiError ? error.message : 'We couldn’t save that. Please try again.'),
  })

  const finish = useMutation({
    mutationFn: (skipUnconfirmed: boolean) =>
      apiFetch(`/api/cycles/${cycleId}/finalize`, { method: 'POST', body: { skipUnconfirmed } }),
    onSuccess: () => {
      setConfirmSkipOpen(false)
      onFinished()
    },
  })

  if (queue.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <span className="sr-only">Loading the answers to check…</span>
        <Skeleton className="h-64" />
      </div>
    )
  }
  if (queue.isError) {
    return <ErrorState title="We couldn’t load the answers to check" onRetry={() => queue.refetch()} />
  }

  const { items, remaining, total } = queue.data
  const visible = items.filter((item) => !skipped.includes(item.gradedItemId))
  const current = visible[0]
  const finishError = finish.error instanceof ApiError ? finish.error.message : null

  if (current) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-h5">A few answers to check</h2>
          <p className="max-w-prose text-body text-text-secondary">
            Handwriting can be hard to read. Tell us what your child wrote and we’ll do the rest. {total - remaining} of{' '}
            {total} checked.
          </p>
        </div>
        <ReviewCard
          key={current.gradedItemId}
          item={current}
          index={total - remaining + skipped.length}
          total={total}
          pending={confirm.isPending}
          error={cardError}
          onConfirm={(answer, leftBlank) => confirm.mutate({ id: current.gradedItemId, answer, leftBlank })}
          onSkip={() => setSkipped((ids) => [...ids, current.gradedItemId])}
        />
      </div>
    )
  }

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-h5">{remaining === 0 ? 'All checked' : 'Some answers are still unchecked'}</h2>
      <p className="max-w-prose text-body text-text-secondary">
        {remaining === 0
          ? 'Thank you. Every answer we weren’t sure about has been confirmed.'
          : `${remaining} ${remaining === 1 ? 'answer is' : 'answers are'} still unchecked. Unchecked answers don’t count towards your child’s levels yet.`}
      </p>
      {finishError ? <Alert tone="danger">{finishError}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        {remaining === 0 ? (
          <Button loading={finish.isPending} onClick={() => finish.mutate(false)}>
            Finish review
          </Button>
        ) : (
          <>
            <Button onClick={() => setSkipped([])}>Check them now</Button>
            <Button variant="secondary" onClick={() => setConfirmSkipOpen(true)}>
              Finish without them
            </Button>
          </>
        )}
      </div>

      <Dialog
        open={confirmSkipOpen}
        onClose={() => setConfirmSkipOpen(false)}
        dismissible={!finish.isPending}
        title="Finish without checking them?"
        description="Answers you skip won’t count towards your child’s levels. You can leave them out now and still get the rest."
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={finish.isPending} onClick={() => setConfirmSkipOpen(false)}>
            Go back
          </Button>
          <Button loading={finish.isPending} onClick={() => finish.mutate(true)}>
            Finish without them
          </Button>
        </div>
      </Dialog>
    </Card>
  )
}
