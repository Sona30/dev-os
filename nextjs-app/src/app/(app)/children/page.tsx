import type { Metadata } from 'next'
import { ChildList } from '@/components/children/ChildList'
import { getChildren } from '@/lib/children/children.service'
import { createServerClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Your children' }
export const dynamic = 'force-dynamic'

export default async function ChildrenPage() {
  const children = await getChildren(createServerClient())
  return <ChildList initialChildren={children} />
}
