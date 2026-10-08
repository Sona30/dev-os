import type { Metadata } from 'next'
import Link from 'next/link'
import { BaselineCard } from '@/components/progress/BaselineCard'
import { ChangeReasonList } from '@/components/progress/ChangeReasonList'
import { DomainTrendChart } from '@/components/progress/DomainTrendChart'
import { ReadingBandCard } from '@/components/progress/ReadingBandCard'
import { SkillTimeline } from '@/components/progress/SkillTimeline'
import { buttonStyles } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { requireChild } from '@/lib/children/children.service'
import { DISCLOSURE } from '@/lib/constants'
import { getProgress } from '@/lib/results/progress.service'
import { childIdParams } from '@/lib/schemas/children'
import { createServerClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Progress' }
export const dynamic = 'force-dynamic'

export default async function ProgressPage({ params }: { params: { childId: string } }) {
  const { childId } = childIdParams.parse(params)
  const supabase = createServerClient()
  await requireChild(supabase, childId)
  const progress = await getProgress(supabase, childId)

  if (progress.completedCycles === 0) {
    return (
      <EmptyState
        title="Progress appears after the first worksheet"
        description="Once a worksheet has been completed and checked, you’ll see how each area is going and why levels change."
        action={
          <Link href={`/children/${childId}/plan`} className={buttonStyles()}>
            Go to the gap analysis
          </Link>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="trend-heading" className="flex flex-col gap-4">
        <h2 id="trend-heading" className="text-h5">
          How each area is going
        </h2>
        {progress.completedCycles < 2 ? (
          <p className="max-w-prose text-body text-text-secondary">
            Trends appear after a couple of worksheets. One sheet is just a first look.
          </p>
        ) : null}
        {progress.domains.length > 0 ? (
          <DomainTrendChart domains={progress.domains} />
        ) : (
          <p className="max-w-prose text-body text-text-secondary">
            There wasn’t enough clear evidence yet to chart any area.
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <BaselineCard baseline={progress.baseline} />
        <ReadingBandCard reading={progress.reading} />
      </div>

      <SkillTimeline skills={progress.skills} />
      <ChangeReasonList changes={progress.changes} />

      <p className="max-w-prose text-caption text-text-secondary">{DISCLOSURE}</p>
    </div>
  )
}
