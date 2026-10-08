import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthForm } from '@/components/auth/AuthForm'
import { SignupForm } from '@/components/auth/SignupForm'

export const metadata: Metadata = { title: 'Create your account' }

export default function SignupPage() {
  return (
    <AuthForm
      title="Create your account"
      description="For parents and guardians. Your child never needs to log in."
      footer={
        <p>
          Already have an account?{' '}
          <Link href="/login" className="text-brand underline">
            Log in
          </Link>
        </p>
      }
    >
      <SignupForm />
    </AuthForm>
  )
}
