'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { useUpdateChild } from '@/hooks/use-children'
import { ApiError } from '@/lib/client/api'
import { looksLikeFullName, normalizeNickname } from '@/lib/children/nickname'
import type { ChildDto } from '@/lib/children/types'
import { nickname } from '@/lib/schemas/common'
import type { UpdateChildInput } from '@/lib/schemas/children'

const formSchema = z.object({
  nickname,
  grade: z.enum(['1', '2']),
  lexile: z
    .string()
    .trim()
    .refine((value) => value === '' || /^\d+$/.test(value), 'Enter a whole number from 0 to 1500')
    .refine((value) => value === '' || Number(value) <= 1500, 'Enter a number from 0 to 1500'),
})
type FormValues = z.infer<typeof formSchema>

export function ChildSettingsForm({ child }: { child: ChildDto }) {
  const router = useRouter()
  const updateChild = useUpdateChild(child.id)
  const [formError, setFormError] = useState<string | null>(null)
  const [savedNotice, setSavedNotice] = useState<string | null>(null)
  const gradeLocked = child.currentCycle > 0

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nickname: child.nickname,
      grade: String(child.grade) as '1' | '2',
      lexile: child.lexile === null ? '' : String(child.lexile),
    },
  })

  const onSubmit = handleSubmit((values) => {
    setFormError(null)
    setSavedNotice(null)

    const changes: UpdateChildInput = {}
    if (normalizeNickname(values.nickname) !== child.nickname) changes.nickname = values.nickname
    if (Number(values.grade) !== child.grade) changes.grade = values.grade === '1' ? 1 : 2
    const lexile = values.lexile === '' ? null : Number(values.lexile)
    if (lexile !== child.lexile) changes.lexile = lexile

    if (Object.keys(changes).length === 0) {
      setSavedNotice('Nothing to change.')
      return
    }

    updateChild.mutate(changes, {
      onSuccess: (saved) => {
        // Re-baseline the form on the stored values so it is no longer "dirty".
        reset({
          nickname: saved.nickname,
          grade: String(saved.grade) as '1' | '2',
          lexile: saved.lexile === null ? '' : String(saved.lexile),
        })
        setSavedNotice('Saved.')
        router.refresh()
      },
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'CHILD_EXISTS') {
          setError('nickname', { message: error.message })
        } else {
          setFormError(error instanceof ApiError ? error.message : 'We couldn’t save that. Please try again.')
        }
      },
    })
  })

  const nicknameValue = watch('nickname') ?? ''

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      {savedNotice && !isDirty ? <Alert tone="success">{savedNotice}</Alert> : null}

      <Field id="settings-nickname" label="First name or nickname" error={errors.nickname?.message}>
        <Input autoComplete="off" maxLength={30} {...register('nickname')} />
      </Field>
      {looksLikeFullName(nicknameValue) ? (
        <Alert tone="info">We only need a first name or nickname. You can shorten it if you like.</Alert>
      ) : null}

      <fieldset className="flex flex-col gap-2" disabled={gradeLocked}>
        <legend className="mb-1 text-body text-text-primary">Grade</legend>
        <div className="flex gap-2">
          {(['1', '2'] as const).map((value) => (
            <label
              key={value}
              className="flex h-11 flex-1 cursor-pointer items-center gap-3 rounded-md border border-line-strong bg-canvas px-3 text-body"
            >
              <input type="radio" value={value} className="h-5 w-5 accent-brand" {...register('grade')} />
              {value === '1' ? '1st grade' : '2nd grade'}
            </label>
          ))}
        </div>
        {gradeLocked ? (
          <p className="text-caption text-text-secondary">
            Grade can’t be changed after the first worksheet. To practise a different grade, add a new profile.
          </p>
        ) : null}
      </fieldset>

      <Field
        id="settings-lexile"
        label="Lexile score (optional)"
        hint={
          child.readingBand
            ? `From the i-Ready Reading report. Current reading level: ${child.readingBand}${
                child.readingBandEstimated ? ' (estimated)' : ' (approximate, from the Lexile score)'
              }.`
            : 'From the i-Ready Reading report. It helps us match the reading level of the word problems.'
        }
        error={errors.lexile?.message}
      >
        <Input inputMode="numeric" autoComplete="off" {...register('lexile')} />
      </Field>

      <div>
        <Button type="submit" loading={updateChild.isPending}>
          {updateChild.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
