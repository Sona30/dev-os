'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { entitlementsKey, useEntitlements } from '@/hooks/use-entitlements'
import { ApiError, apiFetch } from '@/lib/client/api'

/** Pre-launch interest capture: stores a yes/no on the parent's account. No payment details are collected. */
export function NotifyMeButton() {
  const queryClient = useQueryClient()
  const { data: entitlements } = useEntitlements()
  const [error, setError] = useState<string | null>(null)

  const setOptIn = useMutation({
    mutationFn: (optIn: boolean) => apiFetch('/api/waitlist', { method: 'POST', body: { optIn } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: entitlementsKey }),
    onError: (failure) => setError(failure instanceof ApiError ? failure.message : 'We couldn’t save that.'),
  })

  const optedIn = entitlements?.waitlistOptIn ?? false

  return (
    <div className="flex flex-col gap-2">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {optedIn ? (
        <Alert tone="success">Thanks — we’ll email you when paid plans are ready.</Alert>
      ) : null}
      <div>
        <Button
          variant={optedIn ? 'secondary' : 'primary'}
          loading={setOptIn.isPending}
          onClick={() => {
            setError(null)
            setOptIn.mutate(!optedIn)
          }}
        >
          {optedIn ? 'Stop notifying me' : 'Notify me'}
        </Button>
      </div>
    </div>
  )
}
