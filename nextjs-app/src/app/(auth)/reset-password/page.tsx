import type { Metadata } from 'next'
import { AuthForm } from '@/components/auth/AuthForm'
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'

export const metadata: Metadata = { title: 'Choose a new password' }

export default function ResetPasswordPage() {
  return (
    <AuthForm title="Choose a new password">
      <ResetPasswordForm />
    </AuthForm>
  )
}
