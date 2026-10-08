import { Card } from '@/components/ui/Card'
import { formatDate } from '@/lib/results/format'
import type { ProgressDto } from '@/lib/results/types'

const WINDOWS = { BOY: 'Beginning of year', MOY: 'Middle of year', EOY: 'End of year' } as const

/** Where we started. Worksheet results are practice evidence; they never change an i-Ready score. */
export function BaselineCard({ baseline }: { baseline: ProgressDto['baseline'] }) {
  return (
    <Card className="flex flex-col gap-2">
      <h3 className="text-body text-text-primary">Where we started</h3>
      {baseline ? (
        <p className="text-caption text-text-secondary">
          {baseline.placement ?? 'Placement not provided'}
          {baseline.overallScore !== null ? ` · scale score ${baseline.overallScore}` : ''}
          {baseline.window ? ` · ${WINDOWS[baseline.window]}` : ''}
          {baseline.date ? ` · entered ${formatDate(baseline.date)}` : ''}
        </p>
      ) : (
        <p className="text-caption text-text-secondary">No i-Ready result has been entered yet.</p>
      )}
      <p className="text-caption text-text-secondary">
        Worksheet results show what your child can do in practice. They don’t change an i-Ready score, so compare with
        the next report when it arrives.
      </p>
    </Card>
  )
}
