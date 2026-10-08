import type { Metadata } from 'next'
import { SetupFlow } from '@/components/intake/SetupFlow'
import { requireChild } from '@/lib/children/children.service'
import { getLatestReport } from '@/lib/reports/reports.service'
import { childIdParams } from '@/lib/schemas/children'
import { createServerClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Set up' }
export const dynamic = 'force-dynamic'

export default async function SetupPage({ params }: { params: { childId: string } }) {
  const { childId } = childIdParams.parse(params)
  const supabase = createServerClient()
  const child = await requireChild(supabase, childId)
  const report = await getLatestReport(supabase, child)

  return <SetupFlow child={{ id: child.id, nickname: child.nickname, grade: child.grade }} initialReport={report} />
}
