import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/LegalPage'
import { PRIVACY } from '@/lib/legal/content'

export const metadata: Metadata = { title: PRIVACY.title }

export default function Page() {
  return <LegalPage doc={PRIVACY} />
}
