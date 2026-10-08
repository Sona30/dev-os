import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthForm } from '@/components/auth/AuthForm'
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'

export const metadata: Metadata = { title: 'Reset your password' }

export default function ForgotPasswordPage() {
  return (
    <AuthForm
      title="Reset your password"
      description="Enter your email and we’ll send you a link to choose a new one."
      footer={
        <p>
          Remembered it?{' '}
          <Link href="/login" className="text-brand underline">
            Back to log in
          </Link>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthForm>
  )
}
