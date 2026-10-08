'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { apiFetch, ApiError } from '@/lib/client/api'

type PaperSize = 'letter' | 'a4'

interface PaperSizeFormProps {
  initialPaperSize: PaperSize
}

export function PaperSizeForm({ initialPaperSize }: PaperSizeFormProps) {
  const [saved, setSaved] = useState<PaperSize>(initialPaperSize)
  const [value, setValue] = useState<PaperSize>(initialPaperSize)

  const mutation = useMutation({
    mutationFn: (paperSize: PaperSize) =>
      apiFetch<{ paperSize: PaperSize }>('/api/me', { method: 'PATCH', body: { paperSize } }),
    onSuccess: (profile) => {
      setSaved(profile.paperSize)
      setValue(profile.paperSize)
    },
  })

  const unchanged = value === saved

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate(value)
      }}
    >
      {mutation.isError ? (
        <Alert tone="danger">
          {mutation.error instanceof ApiError ? mutation.error.message : 'We couldn’t save that. Please try again.'}
        </Alert>
      ) : null}
      {mutation.isSuccess && unchanged ? <Alert tone="success">Paper size saved.</Alert> : null}
      <Field id="paper-size" label="Paper size" hint="Used for new worksheets. You can change it on any worksheet too.">
        <Select value={value} onChange={(event) => setValue(event.target.value as PaperSize)}>
          <option value="letter">US Letter</option>
          <option value="a4">A4</option>
        </Select>
      </Field>
      <div>
        <Button type="submit" loading={mutation.isPending} disabled={unchanged}>
          {mutation.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
