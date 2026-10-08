'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { ApiError, apiFetch } from '@/lib/client/api'

type Value = 'too_hard' | 'too_easy'

interface DifficultyFeedbackProps {
  cycleId: string
  initial: Value | null
}

/** "Too hard / too easy" shapes the next worksheet only; it never counts as the child's result. */
export function DifficultyFeedback({ cycleId, initial }: DifficultyFeedbackProps) {
  const [chosen, setChosen] = useState<Value | null>(initial)
  const [error, setError] = useState<string | null>(null)

  const send = useMutation({
    mutationFn: (value: Value) => apiFetch(`/api/cycles/${cycleId}/difficulty`, { method: 'POST', body: { value } }),
    onSuccess: (_, value) => setChosen(value),
    onError: (failure) => setError(failure instanceof ApiError ? failure.message : 'We couldn’t save that.'),
  })

  return (
    <div className="flex flex-col gap-2">
      <p className="text-body text-text-primary">How does this worksheet look?</p>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['too_hard', 'Looks too hard'],
            ['too_easy', 'Looks too easy'],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            variant={chosen === value ? 'primary' : 'secondary'}
            size="sm"
            aria-pressed={chosen === value}
            loading={send.isPending && send.variables === value}
            onClick={() => {
              setError(null)
              send.mutate(value)
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      {chosen ? (
        <p className="text-caption text-text-secondary">
          Thanks. The next worksheet will {chosen === 'too_hard' ? 'start gentler' : 'include more challenge'}.
        </p>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  )
}
