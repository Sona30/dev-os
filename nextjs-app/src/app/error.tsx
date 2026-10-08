'use client'

import { useEffect } from 'react'
import { reportClientError } from '@/lib/client/track'

import { Button } from '@/components/ui/Button'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError('app')
  }, [])

  return (
    <main id="main" className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12 md:py-24">
      <h1 className="text-h4">Something went wrong</h1>
      <p className="text-body text-text-secondary" role="alert">
        Please try again. If it keeps happening, tell us the reference below.
      </p>
      {error.digest ? <p className="text-caption text-text-secondary">Reference: {error.digest}</p> : null}
      <div>
        <Button onClick={reset}>Try again</Button>
      </div>
    </main>
  )
}
