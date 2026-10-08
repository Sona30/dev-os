import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthForm } from '@/components/auth/AuthForm'
import { ExpiredLinkNotice } from '@/components/auth/ExpiredLinkNotice'
import { LoginForm } from '@/components/auth/LoginForm'
import { safeNext } from '@/lib/auth/safe-next'

export const metadata: Metadata = { title: 'Log in' }

interface LoginPageProps {
  searchParams: { next?: string; error?: string }
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  const next = safeNext(searchParams.next)

  return (
    <div className="flex flex-col gap-4">
      {searchParams.error === 'link_expired' ? <ExpiredLinkNotice /> : null}
      <AuthForm
        title="Log in"
        description="Welcome back. Pick up where your child left off."
        footer={
          <p>
            New to TestReady?{' '}
            <Link href="/signup" className="text-brand underline">
              Create an account
            </Link>
          </p>
        }
      >
        <LoginForm next={next} />
      </AuthForm>
    </div>
  )
}
