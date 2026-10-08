import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { SiteNotice } from '@/components/layout/SiteNotice'
import './globals.css'

// docs/design.md specifies "Inter Display". It is not a separate Google Fonts family, so we load
// Inter (variable) and keep "Inter Display" first in the stack for
// machines that have it installed.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: {
    default: 'TestReady — practice built from your child’s i-Ready result',
    template: '%s · TestReady',
  },
  description:
    'Turn your 1st or 2nd grader’s i-Ready Math result into printable word problems that practise exactly what they’re still building.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <SiteNotice />
        {children}
      </body>
    </html>
  )
}
