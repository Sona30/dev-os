import { notFound } from 'next/navigation'
import { ChildNav } from '@/components/children/ChildNav'
import { ChildSwitcher } from '@/components/children/ChildSwitcher'
import { Badge } from '@/components/ui/Badge'
import { getChildren } from '@/lib/children/children.service'
import { gradeLabel } from '@/lib/children/format'
import { childIdParams } from '@/lib/schemas/children'
import { createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Frame for everything about one child. Unknown ids and other people's children both render "not found".
export default async function ChildLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { childId: string }
}) {
  const parsed = childIdParams.safeParse(params)
  if (!parsed.success) notFound()

  const allChildren = await getChildren(createServerClient())
  const child = allChildren.find((item) => item.id === parsed.data.childId)
  if (!child) notFound()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-h4">{child.nickname}</h1>
          <Badge tone="info">{gradeLabel(child.grade)}</Badge>
        </div>
        <ChildSwitcher options={allChildren} currentChildId={child.id} />
      </div>
      <ChildNav childId={child.id} />
      <div>{children}</div>
    </div>
  )
}
