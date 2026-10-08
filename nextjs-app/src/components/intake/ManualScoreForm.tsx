'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { z } from 'zod'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ApiError, apiFetch } from '@/lib/client/api'
import { placementOptionsFor } from '@/lib/reports/placements'
import type { ReportDto } from '@/lib/reports/types'
import type { Grade } from '@/lib/schemas/common'

const formSchema = z
  .object({
    placement: z.string(),
    overallScore: z
      .string()
      .trim()
      .refine((value) => value === '' || /^\d+$/.test(value), 'Enter a whole number')
      .refine((value) => value === '' || Number(value) <= 1000, 'Enter a score from 0 to 1000'),
    window: z.enum(['', 'BOY', 'MOY', 'EOY']),
    lexile: z
      .string()
      .trim()
      .refine((value) => value === '' || /^\d+$/.test(value), 'Enter a whole number')
      .refine((value) => value === '' || Number(value) <= 1500, 'Enter a number from 0 to 1500'),
  })
  .refine((value) => value.placement !== '' || value.overallScore !== '', {
    message: 'Choose a placement or enter the overall score',
    path: ['placement'],
  })
type FormValues = z.infer<typeof formSchema>

interface ManualScoreFormProps {
  childId: string
  grade: Grade
  onCreated: (report: ReportDto) => void
}

/** No report to hand? Type the overall score or placement instead (FR-01). */
export function ManualScoreForm({ childId, grade, onCreated }: ManualScoreFormProps) {
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { placement: '', overallScore: '', window: '', lexile: '' },
  })

  const create = useMutation({
    mutationFn: (values: FormValues) =>
      apiFetch<{ report: ReportDto }>(`/api/children/${childId}/reports`, {
        method: 'POST',
        body: {
          manual: {
            ...(values.placement !== '' ? { placement: values.placement } : {}),
            ...(values.overallScore !== '' ? { overallScore: Number(values.overallScore) } : {}),
            ...(values.window !== '' ? { window: values.window } : {}),
            ...(values.lexile !== '' ? { lexile: Number(values.lexile) } : {}),
          },
        },
      }),
    onSuccess: ({ report }) => onCreated(report),
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'CONTRADICTORY_INPUT') {
        setError('placement', { message: error.message })
      } else {
        setFormError(error instanceof ApiError ? error.message : 'We couldn’t save that. Please try again.')
      }
    },
  })

  return (
    <form
      onSubmit={handleSubmit((values) => {
        setFormError(null)
        create.mutate(values)
      })}
      noValidate
      className="flex flex-col gap-4"
    >
      {formError ? <Alert tone="danger">{formError}</Alert> : null}

      <Field
        id="manual-placement"
        label="Overall placement"
        hint="It’s printed on the report, for example “Mid Grade 1”."
        error={errors.placement?.message}
      >
        <Select {...register('placement')}>
          <option value="">Not sure / skip</option>
          {placementOptionsFor(grade).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </Field>

      <Field id="manual-score" label="Overall scale score (optional)" error={errors.overallScore?.message}>
        <Input inputMode="numeric" autoComplete="off" {...register('overallScore')} />
      </Field>

      <Field id="manual-window" label="When was the test taken? (optional)">
        <Select {...register('window')}>
          <option value="">Not sure / skip</option>
          <option value="BOY">Beginning of year</option>
          <option value="MOY">Middle of year</option>
          <option value="EOY">End of year</option>
        </Select>
      </Field>

      <Field
        id="manual-lexile"
        label="Lexile score (optional)"
        hint="From the i-Ready Reading report. It helps match the reading level of the word problems."
        error={errors.lexile?.message}
      >
        <Input inputMode="numeric" autoComplete="off" {...register('lexile')} />
      </Field>

      <div>
        <Button type="submit" loading={create.isPending}>
          {create.isPending ? 'Saving…' : 'Continue'}
        </Button>
      </div>
    </form>
  )
}
