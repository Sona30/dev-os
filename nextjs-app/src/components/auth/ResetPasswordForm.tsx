'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { PasswordField } from '@/components/auth/PasswordField'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { AUTH_MESSAGES } from '@/lib/client/auth'
import { resetPasswordSchema, type ResetPasswordValues } from '@/lib/schemas/auth'
import { createBrowserClient } from '@/lib/supabase/browser'

type SessionState = 'checking' | 'ready' | 'expired'

export function ResetPasswordForm() {
  const router = useRouter()
  const [sessionState, setSessionState] = useState<SessionState>('checking')
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  })

  // The reset link signs the parent in via /auth/callback; without that session there is nothing to update.
  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const { data } = await createBrowserClient().auth.getUser()
        if (!cancelled) setSessionState(data.user ? 'ready' : 'expired')
      } catch {
        if (!cancelled) setSessionState('expired')
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [])

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null)
    const { error } = await createBrowserClient().auth.updateUser({ password })
    if (error) {
      if (error.code === 'same_password') {
        setFormError('Please choose a password you haven’t used before.')
      } else if (error.code === 'weak_password') {
        setFormError('Please choose a stronger password (at least 10 characters).')
      } else {
        setFormError(AUTH_MESSAGES.generic)
      }
      return
    }
    router.replace('/children')
    router.refresh()
  })

  if (sessionState === 'checking') {
    return (
      <p className="text-body text-text-secondary" role="status">
        Checking your link…
      </p>
    )
  }

  if (sessionState === 'expired') {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="warning">This link has expired or was already used.</Alert>
        <Link href="/forgot-password" className="text-body text-brand underline">
          Send me a new reset link
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Field id="reset-password" label="New password" hint="At least 10 characters." error={errors.password?.message}>
        <PasswordField autoComplete="new-password" {...register('password')} />
      </Field>
      <Field id="reset-confirm" label="Confirm new password" error={errors.confirm?.message}>
        <PasswordField autoComplete="new-password" {...register('confirm')} />
      </Field>
      <Button type="submit" loading={isSubmitting}>
        {isSubmitting ? 'Saving…' : 'Save new password'}
      </Button>
    </form>
  )
}
