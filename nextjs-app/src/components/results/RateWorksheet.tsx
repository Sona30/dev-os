'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Star } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { ApiError, apiFetch } from '@/lib/client/api'
import { cn } from '@/lib/utils'

interface RateWorksheetProps {
  worksheetId: string
  initial: { rating: number; comment: string | null } | null
}

/** How useful was this worksheet? One rating per worksheet; rating again replaces it. */
export function RateWorksheet({ worksheetId, initial }: RateWorksheetProps) {
  const [rating, setRating] = useState(initial?.rating ?? 0)
  const [comment, setComment] = useState(initial?.comment ?? '')
  const [saved, setSaved] = useState(initial !== null)

  const save = useMutation({
    mutationFn: () =>
      apiFetch('/api/feedback', {
        method: 'POST',
        body: { worksheetId, rating, ...(comment.trim() ? { comment: comment.trim() } : {}) },
      }),
    onSuccess: () => setSaved(true),
  })

  return (
    <section aria-labelledby="rate-heading" className="flex flex-col gap-4">
      <h2 id="rate-heading" className="text-h5">
        How was this worksheet?
      </h2>
      <div role="group" aria-label="Rating, from 1 to 5 stars" className="flex gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            aria-label={`${value} ${value === 1 ? 'star' : 'stars'}`}
            aria-pressed={rating === value}
            onClick={() => {
              setRating(value)
              setSaved(false)
            }}
            className="flex h-11 w-11 items-center justify-center rounded-md transition-colors duration-fast ease-enter hover:bg-subtle"
          >
            <Star
              className={cn('h-6 w-6', value <= rating ? 'fill-warning text-warning' : 'text-line-strong')}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
      <div className="flex max-w-prose flex-col gap-1">
        <label htmlFor="rate-comment" className="text-caption text-text-secondary">
          Anything we should know? (optional)
        </label>
        <textarea
          id="rate-comment"
          value={comment}
          maxLength={500}
          rows={3}
          onChange={(event) => {
            setComment(event.target.value)
            setSaved(false)
          }}
          className="w-full rounded-md border border-line-strong bg-canvas p-3 text-body text-text-primary transition-colors duration-fast ease-enter hover:bg-subtle focus:border-brand"
        />
      </div>
      {save.isError ? (
        <Alert tone="danger">
          {save.error instanceof ApiError ? save.error.message : 'We couldn’t save that. Please try again.'}
        </Alert>
      ) : null}
      {saved ? <Alert tone="success">Thanks for the feedback.</Alert> : null}
      <div>
        <Button variant="secondary" disabled={rating === 0 || saved} loading={save.isPending} onClick={() => save.mutate()}>
          Save rating
        </Button>
      </div>
    </section>
  )
}
