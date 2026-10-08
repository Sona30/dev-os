import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/LegalPage'
import { TRUST } from '@/lib/legal/content'

export const metadata: Metadata = { title: TRUST.title }

export default function Page() {
  return <LegalPage doc={TRUST} />
}
