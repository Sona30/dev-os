'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { AUTH_MESSAGES, getSiteUrl, messageFromError, precheckAuthAttempt } from '@/lib/client/auth'
import { resendConfirmationSchema } from '@/lib/schemas/auth'
import { createBrowserClient } from '@/lib/supabase/browser'

interface ResendValues {
  email: string
}

/** Shown on /login?error=link_expired: explains the problem and lets the parent request a new confirmation link. */
export function ExpiredLinkNotice() {
  const [formError, setFormError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResendValues>({
    resolver: zodResolver(resendConfirmationSchema),
    defaultValues: { email: '' },
  })

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(null)
    try {
      await precheckAuthAttempt()
    } catch (error) {
      setFormError(messageFromError(error))
      return
    }
    try {
      const { error } = await createBrowserClient().auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${getSiteUrl()}/auth/callback` },
      })
      if (error && (error.status === 0 || (error.status ?? 0) >= 500)) {
        setFormError(AUTH_MESSAGES.generic)
        return
      }
      setSent(true)
    } catch (error) {
      console.error(error)
      setFormError(AUTH_MESSAGES.unavailable)
    }
  })

  return (
    <div className="flex flex-col gap-4">
      <Alert tone="warning">That link has expired or was already used.</Alert>
      {sent ? (
        <Alert tone="success">If that address is waiting for confirmation, we’ve sent a new link.</Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          <Field id="resend-email" label="Send a new confirmation link to" error={errors.email?.message}>
            <Input type="email" autoComplete="email" inputMode="email" {...register('email')} />
          </Field>
          <Button type="submit" variant="secondary" loading={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send a new link'}
          </Button>
        </form>
      )}
    </div>
  )
}
