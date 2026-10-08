import { formatDate } from '@/lib/results/format'
import type { ResultsDto } from '@/lib/results/types'

export function ResultSummary({ results }: { results: ResultsDto }) {
  return (
    <section aria-labelledby="summary-heading" className="flex flex-col gap-2">
      <h2 id="summary-heading" className="text-h5">
        Summary
      </h2>
      <p className="max-w-prose text-body text-text-primary">{results.summary}</p>
      <p className="text-caption text-text-secondary">
        Sheet {results.cycle.sheetId ?? ''}
        {results.cycle.completedAt ? ` · ${formatDate(results.cycle.completedAt)}` : ''}
      </p>
    </section>
  )
}
