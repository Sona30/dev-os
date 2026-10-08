'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { AUTH_MESSAGES, getSiteUrl, messageFromError, precheckAuthAttempt } from '@/lib/client/auth'
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/lib/schemas/auth'
import { createBrowserClient } from '@/lib/supabase/browser'

export function ForgotPasswordForm() {
  const [formError, setFormError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
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

    let supabase: ReturnType<typeof createBrowserClient>
    try {
      supabase = createBrowserClient()
    } catch (error) {
      console.error(error)
      setFormError(AUTH_MESSAGES.unavailable)
      return
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${getSiteUrl()}/auth/callback?next=/reset-password`,
    })
    // Same confirmation whether or not the address has an account. Only real outages are surfaced.
    if (error && (error.status === 0 || (error.status ?? 0) >= 500)) {
      setFormError(AUTH_MESSAGES.generic)
      return
    }
    setSent(true)
  })

  if (sent) {
    return (
      <Alert tone="success">
        <p className="font-medium">Check your email</p>
        <p>If that address has an account, we’ve sent a link to choose a new password.</p>
      </Alert>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Field id="forgot-email" label="Email" error={errors.email?.message}>
        <Input type="email" autoComplete="email" inputMode="email" {...register('email')} />
      </Field>
      <Button type="submit" loading={isSubmitting}>
        {isSubmitting ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  )
}
