import Link from 'next/link'
import { RegionNotice } from '@/components/layout/RegionNotice'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="mx-auto flex max-w-6xl items-center px-4 py-4 md:px-8">
        <Link href="/" className="text-h5">
          TestReady
        </Link>
      </header>
      <main id="main" className="mx-auto w-full max-w-md px-4 py-8 md:py-16">
        <RegionNotice />
        {children}
      </main>
    </div>
  )
}
