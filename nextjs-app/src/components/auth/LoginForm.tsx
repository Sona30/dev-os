'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { PasswordField } from '@/components/auth/PasswordField'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { ApiError, apiFetch } from '@/lib/client/api'
import { AUTH_MESSAGES, messageFromError } from '@/lib/client/auth'
import { loginSchema, type LoginValues } from '@/lib/schemas/auth'

export function LoginForm({ next }: { next: string }) {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      // Sign-in runs on the server (rate limits, cookies set server-side); see app/api/auth/login/route.ts.
      await apiFetch('/api/auth/login', { method: 'POST', body: values })
    } catch (error) {
      // INVALID_CREDENTIALS is deliberately identical for unknown email, wrong password and unconfirmed email
      // (no account enumeration); RATE_LIMITED and the rest carry their own plain-language message.
      setFormError(
        error instanceof ApiError && error.code === 'INVALID_CREDENTIALS'
          ? AUTH_MESSAGES.invalidCredentials
          : messageFromError(error),
      )
      return
    }
    router.replace(next)
    router.refresh()
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Field id="login-email" label="Email" error={errors.email?.message}>
        <Input type="email" autoComplete="email" inputMode="email" {...register('email')} />
      </Field>
      <Field id="login-password" label="Password" error={errors.password?.message}>
        <PasswordField autoComplete="current-password" {...register('password')} />
      </Field>
      <div className="flex flex-col gap-4">
        <Button type="submit" loading={isSubmitting}>
          {isSubmitting ? 'Logging in…' : 'Log in'}
        </Button>
        <Link href="/forgot-password" className="text-body text-brand underline">
          Forgot your password?
        </Link>
      </div>
    </form>
  )
}
