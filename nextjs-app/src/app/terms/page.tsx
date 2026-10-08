import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/LegalPage'
import { TERMS } from '@/lib/legal/content'

export const metadata: Metadata = { title: TERMS.title }

export default function Page() {
  return <LegalPage doc={TERMS} />
}
