'use client'

import { useEffect } from 'react'
import { reportClientError } from '@/lib/client/track'

import { ErrorState } from '@/components/ui/ErrorState'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError('signed-in-area')
  }, [])

  return <ErrorState reference={error.digest} onRetry={reset} />
}
