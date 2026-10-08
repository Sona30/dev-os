import Link from 'next/link'
import { buttonStyles } from '@/components/ui/Button'

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12 md:py-24">
      <h1 className="text-h4">We couldn’t find that page</h1>
      <p className="text-body text-text-secondary">The link may be old, or the page may have moved.</p>
      <div>
        <Link href="/" className={buttonStyles()}>
          Go to home
        </Link>
      </div>
    </main>
  )
}
