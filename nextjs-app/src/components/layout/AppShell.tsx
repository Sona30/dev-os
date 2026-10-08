import Link from 'next/link'
import { AccountMenu } from '@/components/layout/AccountMenu'
import { RegionNotice } from '@/components/layout/RegionNotice'
import { NON_AFFILIATION } from '@/lib/constants'

interface AppShellProps {
  email: string
  children: React.ReactNode
}

/** Frame for every signed-in page: header with navigation and account controls, main landmark, footer. */
export function AppShell({ email, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-canvas">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-8">
          <nav aria-label="Main" className="flex items-center gap-6">
            <Link href="/children" className="text-h5">
              TestReady
            </Link>
          </nav>
          <AccountMenu email={email} />
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-8 md:py-12">
        <RegionNotice />
        {children}
      </main>

      <footer className="border-t border-line bg-canvas">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 md:px-8">
          <p className="text-caption text-text-secondary">{NON_AFFILIATION}</p>
          <nav aria-label="Legal" className="flex gap-4 text-caption">
            <Link href="/privacy" className="underline">
              Privacy
            </Link>
            <Link href="/terms" className="underline">
              Terms
            </Link>
            <Link href="/trust" className="underline">
              Trust
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
