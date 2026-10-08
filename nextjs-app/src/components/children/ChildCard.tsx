import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { cycleLabel, gradeLabel } from '@/lib/children/format'
import type { ChildDto } from '@/lib/children/types'

export function ChildCard({ child }: { child: ChildDto }) {
  return (
    <Link
      href={`/children/${child.id}/setup`}
      className="block rounded-lg transition-colors duration-fast ease-enter hover:bg-subtle"
    >
      <Card className="flex flex-col gap-4 bg-transparent">
        <h3 className="text-h5">{child.nickname}</h3>
        <div className="flex flex-wrap gap-2">
          <Badge tone="info">{gradeLabel(child.grade)}</Badge>
          <Badge>{cycleLabel(child.currentCycle)}</Badge>
          {child.readingBand ? (
            <Badge tone={child.readingBandEstimated ? 'warning' : 'success'}>
              Reading {child.readingBand}
              {child.readingBandEstimated ? ' (estimated)' : ''}
            </Badge>
          ) : null}
        </div>
      </Card>
    </Link>
  )
}
