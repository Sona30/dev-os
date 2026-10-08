import type { Metadata } from 'next'
import Link from 'next/link'
import { NotifyMeButton } from '@/components/pricing/NotifyMeButton'
import { PlanCards } from '@/components/pricing/PlanCards'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { buttonStyles } from '@/components/ui/Button'
import { getCurrentUser } from '@/lib/auth/current-user'

export const metadata: Metadata = { title: 'Plans' }
export const dynamic = 'force-dynamic'

export default async function PricingPage() {
  const user = await getCurrentUser()

  return (
    <main id="main" className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-12 md:px-8 md:py-24">
      <header className="flex max-w-3xl flex-col gap-4">
        <h1 className="text-h3 md:text-h2">Plans</h1>
        <p className="text-body text-text-secondary">
          Start with a free diagnostic built from your child’s own result. Less than one tutoring session a month, and the
          practice matches the report.
        </p>
      </header>

      <PlanCards />

      <section aria-labelledby="notify-heading" className="flex max-w-xl flex-col gap-4">
        <h2 id="notify-heading" className="text-h5">
          Paid plans are coming
        </h2>
        <p className="text-body text-text-secondary">
          Checkout isn’t open yet, so there’s nothing to pay for today. Tell us you’re interested and we’ll let you know.
        </p>
        {user ? (
          <QueryProvider>
            <NotifyMeButton />
          </QueryProvider>
        ) : (
          <div>
            <Link href="/signup" className={buttonStyles()}>
              Create a free account
            </Link>
          </div>
        )}
      </section>

      <p className="text-caption text-text-secondary">
        Prices are a guide and may change. Practice support, not an official assessment.
      </p>
    </main>
  )
}
