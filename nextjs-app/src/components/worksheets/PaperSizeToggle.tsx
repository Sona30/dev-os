'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Alert } from '@/components/ui/Alert'
import { Field } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { useJob } from '@/hooks/use-job'
import { ApiError, apiFetch } from '@/lib/client/api'

interface PaperSizeToggleProps {
  worksheetId: string
  paperSize: 'letter' | 'a4'
  onChanged: () => void
}

/** Rebuild the same questions on Letter or A4 paper. */
export function PaperSizeToggle({ worksheetId, paperSize, onChanged }: PaperSizeToggleProps) {
  const [jobId, setJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const change = useMutation({
    mutationFn: (next: 'letter' | 'a4') =>
      apiFetch<{ jobId: string | null }>(`/api/worksheets/${worksheetId}/repaper`, {
        method: 'POST',
        body: { paperSize: next },
      }),
    onSuccess: ({ jobId: started }) => {
      if (started) setJobId(started)
      else onChanged()
    },
    onError: (failure) => setError(failure instanceof ApiError ? failure.message : 'We couldn’t change the paper size.'),
  })

  const { job } = useJob(jobId, {
    onSuccess: () => {
      setJobId(null)
      onChanged()
    },
    onFailure: (failed) => {
      setJobId(null)
      setError(failed.error?.message ?? 'We couldn’t change the paper size.')
    },
  })

  const rebuilding = jobId !== null && job?.status !== 'failed'

  return (
    <div className="flex flex-col gap-2">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field id="paper-size-toggle" label="Paper size" hint={rebuilding ? 'Rebuilding the files…' : 'Same questions, new layout.'}>
        <Select
          value={paperSize}
          disabled={rebuilding || change.isPending}
          onChange={(event) => {
            setError(null)
            change.mutate(event.target.value as 'letter' | 'a4')
          }}
        >
          <option value="letter">US Letter</option>
          <option value="a4">A4</option>
        </Select>
      </Field>
    </div>
  )
}
