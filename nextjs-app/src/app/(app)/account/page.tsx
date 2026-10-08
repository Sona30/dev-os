import type { Metadata } from 'next'
import { PaperSizeForm } from '@/components/account/PaperSizeForm'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { getCurrentUser } from '@/lib/auth/current-user'
import { getProfile } from '@/lib/auth/profiles.service'
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'Account' }

export default async function AccountPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getProfile(createServerClient(), user.id)

  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <h1 className="text-h4">Account</h1>

      <section aria-labelledby="account-details" className="flex flex-col gap-6">
        <h2 id="account-details" className="text-h5">
          Your details
        </h2>
        <Card>
          <dl className="flex flex-col gap-0.5">
            <dt className="text-body text-text-primary">Email</dt>
            <dd className="text-caption text-text-secondary">{profile.email}</dd>
          </dl>
        </Card>
      </section>

      <section aria-labelledby="account-printing" className="flex flex-col gap-6">
        <h2 id="account-printing" className="text-h5">
          Printing
        </h2>
        <Card>
          <PaperSizeForm initialPaperSize={profile.paperSize} />
        </Card>
      </section>

      <section aria-labelledby="account-data" className="flex flex-col gap-6">
        <h2 id="account-data" className="text-h5">
          Your data
        </h2>
        <Card className="flex flex-col gap-3">
          <p className="max-w-prose text-body text-text-secondary">
            Photos are deleted automatically after 30 days. You can delete a child’s photos, or their whole profile, at
            any time in that child’s Settings.
          </p>
          <p className="text-caption">
            <Link href="/privacy" className="text-brand underline">
              Privacy
            </Link>
            {' · '}
            <Link href="/terms" className="text-brand underline">
              Terms
            </Link>
            {' · '}
            <Link href="/trust" className="text-brand underline">
              How we check our work
            </Link>
          </p>
        </Card>
      </section>
    </div>
  )
}
