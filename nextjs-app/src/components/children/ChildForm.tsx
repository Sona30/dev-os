'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { useCreateChild } from '@/hooks/use-children'
import { ApiError, getFieldErrors } from '@/lib/client/api'
import { looksLikeFullName } from '@/lib/children/nickname'
import { nickname } from '@/lib/schemas/common'

// Radios submit strings; the API receives the numeric grade.
const formSchema = z.object({
  nickname,
  grade: z.enum(['1', '2'], { errorMap: () => ({ message: 'Choose your child’s grade' }) }),
})
type FormValues = z.infer<typeof formSchema>

export function ChildForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter()
  const createChild = useCreateChild()
  const [formError, setFormError] = useState<{ message: string; showPlans: boolean } | null>(null)
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { nickname: '' },
  })

  const nicknameValue = watch('nickname') ?? ''

  const onSubmit = handleSubmit((values) => {
    setFormError(null)
    createChild.mutate(
      { nickname: values.nickname, grade: values.grade === '1' ? 1 : 2 },
      {
        onSuccess: (child) => {
          router.push(`/children/${child.id}/setup`)
        },
        onError: (error) => {
          if (error instanceof ApiError && error.code === 'CHILD_EXISTS') {
            setError('nickname', { message: error.message })
          } else if (error instanceof ApiError && error.code === 'CHILD_LIMIT') {
            setFormError({ message: error.message, showPlans: true })
          } else if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
            const fieldErrors = getFieldErrors(error)
            const first = fieldErrors.nickname?.[0] ?? fieldErrors.grade?.[0]
            setFormError({ message: first ?? error.message, showPlans: false })
          } else {
            setFormError({
              message: error instanceof ApiError ? error.message : 'We couldn’t add your child. Please try again.',
              showPlans: false,
            })
          }
        },
      },
    )
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError ? (
        <Alert tone="danger">
          <p>{formError.message}</p>
          {formError.showPlans ? (
            <Link href="/pricing" className="underline">
              See plans
            </Link>
          ) : null}
        </Alert>
      ) : null}

      <Field
        id="child-nickname"
        label="First name or nickname"
        hint="We never ask for a surname, school or birthdate."
        error={errors.nickname?.message}
      >
        <Input autoComplete="off" maxLength={30} {...register('nickname')} />
      </Field>
      {looksLikeFullName(nicknameValue) ? (
        <Alert tone="info">We only need a first name or nickname. You can shorten it if you like.</Alert>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-body text-text-primary">Grade</legend>
        <div className="flex gap-2">
          {(['1', '2'] as const).map((value) => (
            <label
              key={value}
              className="flex h-11 flex-1 cursor-pointer items-center gap-3 rounded-md border border-line-strong bg-canvas px-3 text-body transition-colors duration-fast ease-enter hover:bg-subtle"
            >
              <input type="radio" value={value} className="h-5 w-5 accent-brand" {...register('grade')} />
              {value === '1' ? '1st grade' : '2nd grade'}
            </label>
          ))}
        </div>
        {errors.grade?.message ? <p className="text-caption text-danger-text">{errors.grade.message}</p> : null}
      </fieldset>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={createChild.isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={createChild.isPending}>
          {createChild.isPending ? 'Adding…' : 'Add child'}
        </Button>
      </div>
    </form>
  )
}
