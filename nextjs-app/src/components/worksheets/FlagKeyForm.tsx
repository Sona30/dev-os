'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { ApiError, apiFetch } from '@/lib/client/api'
import type { StudentItemDto } from '@/lib/worksheets/types'

interface FlagKeyFormProps {
  worksheetId: string
  items: StudentItemDto[]
}

/** If an answer in the parent key looks wrong, say so: that question is left out of the child's results. */
export function FlagKeyForm({ worksheetId, items }: FlagKeyFormProps) {
  const [itemId, setItemId] = useState(items[0]?.id ?? '')
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  const flag = useMutation({
    mutationFn: () => apiFetch(`/api/worksheets/${worksheetId}/items/${itemId}/flag-key`, { method: 'POST', body: {} }),
    onSuccess: () => setMessage({ tone: 'success', text: 'Thanks. We won’t count that question in your child’s results.' }),
    onError: (failure) =>
      setMessage({ tone: 'danger', text: failure instanceof ApiError ? failure.message : 'We couldn’t save that.' }),
  })

  return (
    <details className="rounded-lg border border-line bg-canvas p-4">
      <summary className="cursor-pointer text-body text-text-primary">Think an answer in the parent key is wrong?</summary>
      <form
        className="mt-4 flex max-w-sm flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          setMessage(null)
          flag.mutate()
        }}
      >
        {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
        <Field id="flag-question" label="Which question?">
          <Select value={itemId} onChange={(event) => setItemId(event.target.value)}>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                Question {item.position}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <Button type="submit" variant="secondary" loading={flag.isPending}>
            Tell us
          </Button>
        </div>
      </form>
    </details>
  )
}
