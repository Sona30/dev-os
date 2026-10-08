'use client'

import { Button } from '@/components/ui/Button'

interface ErrorStateProps {
  title?: string
  message?: string
  reference?: string
  onRetry?: () => void
}

/** Plain-language failure with a retry. Never shows provider messages or stack traces. */
export function ErrorState({
  title = 'Something went wrong',
  message = 'Please try again. If it keeps happening, tell us the reference below.',
  reference,
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-lg border border-danger-border bg-danger-bg p-8" role="alert">
      <div className="flex flex-col gap-2">
        <h2 className="text-h5 text-danger-text">{title}</h2>
        <p className="max-w-prose text-body text-danger-text">{message}</p>
        {reference ? <p className="text-caption text-danger-text">Reference: {reference}</p> : null}
      </div>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}
