'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ConsentCheckbox } from '@/components/auth/ConsentCheckbox'
import { PasswordField } from '@/components/auth/PasswordField'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { AUTH_MESSAGES, getSiteUrl, messageFromError, precheckAuthAttempt } from '@/lib/client/auth'
import { signupSchema, type SignupValues } from '@/lib/schemas/auth'
import { createBrowserClient } from '@/lib/supabase/browser'

export function SignupForm() {
  const [formError, setFormError] = useState<string | null>(null)
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: '', password: '', confirm: '', consent: false },
  })

  const onSubmit = handleSubmit(async (values) => {
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

    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        emailRedirectTo: `${getSiteUrl()}/auth/callback`,
        data: { terms_accepted_at: new Date().toISOString() },
      },
    })

    if (error) {
      if (error.code === 'weak_password') {
        setFormError('Please choose a stronger password (at least 10 characters).')
      } else if (error.code === 'over_email_send_rate_limit') {
        setFormError('We’ve sent a lot of emails to this address. Please wait a few minutes and try again.')
      } else {
        setFormError(AUTH_MESSAGES.generic)
      }
      return
    }

    // Same screen whether or not the email already has an account (no account enumeration).
    setSubmittedEmail(values.email)
  })

  if (submittedEmail) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">
          <p className="font-medium">Check your email</p>
          <p>
            If <strong>{submittedEmail}</strong> can be used for a new account, we’ve sent a confirmation link. Open it
            on this device to finish signing up.
          </p>
        </Alert>
        <p className="text-caption text-text-secondary">
          Nothing arrived after a few minutes? Check your spam folder, then try signing up again.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Field id="signup-email" label="Email" error={errors.email?.message}>
        <Input type="email" autoComplete="email" inputMode="email" {...register('email')} />
      </Field>
      <Field
        id="signup-password"
        label="Password"
        hint="At least 10 characters."
        error={errors.password?.message}
      >
        <PasswordField autoComplete="new-password" {...register('password')} />
      </Field>
      <Field id="signup-confirm" label="Confirm password" error={errors.confirm?.message}>
        <PasswordField autoComplete="new-password" {...register('confirm')} />
      </Field>
      <ConsentCheckbox id="signup-consent" error={errors.consent?.message} {...register('consent')} />
      <Button type="submit" loading={isSubmitting}>
        {isSubmitting ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  )
}
