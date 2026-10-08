'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { CalibrationUpdate } from '@/components/results/CalibrationUpdate'
import { DisclosureBanner } from '@/components/results/DisclosureBanner'
import { ItemResultsTable } from '@/components/results/ItemResultsTable'
import { MasteryBySkill } from '@/components/results/MasteryBySkill'
import { RateWorksheet } from '@/components/results/RateWorksheet'
import { ReadingVsMathReadout } from '@/components/results/ReadingVsMathReadout'
import { RecommendationsList } from '@/components/results/RecommendationsList'
import { ResultSummary } from '@/components/results/ResultSummary'
import { TeacherShareNudge } from '@/components/results/TeacherShareNudge'
import { buttonStyles } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/ErrorState'
import { Field } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { apiFetch } from '@/lib/client/api'
import { track } from '@/lib/client/track'
import { formatDate } from '@/lib/results/format'
import type { CycleListItemDto, ResultsDto } from '@/lib/results/types'

interface ResultsViewProps {
  childId: string
  cycles: CycleListItemDto[]
  initial: ResultsDto
  /** The child's most recent cycle, whatever its state. "Next worksheet" is offered only on that one. */
  latestCycleId: string | null
}

/** The full results for a finished worksheet, with a selector for earlier ones. */
export function ResultsView({ childId, cycles, initial, latestCycleId }: ResultsViewProps) {
  const [selectedId, setSelectedId] = useState(initial.cycle.id)

  const results = useQuery({
    queryKey: ['results', selectedId],
    queryFn: () => apiFetch<ResultsDto>(`/api/cycles/${selectedId}/results`),
    initialData: selectedId === initial.cycle.id ? initial : undefined,
    staleTime: 5 * 60_000,
  })

  return (
    <div className="flex flex-col gap-10">
      {cycles.length > 1 ? (
        <div className="max-w-xs">
          <Field id="results-cycle" label="Worksheet">
            <Select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              {cycles.map((cycle) => (
                <option key={cycle.id} value={cycle.id}>
                  Worksheet {cycle.number}
                  {cycle.date ? ` · ${formatDate(cycle.date)}` : ''}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : null}

      {results.isPending ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <span className="sr-only">Loading results…</span>
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </div>
      ) : results.isError ? (
        <ErrorState title="We couldn’t load these results" onRetry={() => results.refetch()} />
      ) : (
        <>
          <ResultSummary results={results.data} />
          {results.data.flags.includes('suggest_teacher_share') ? <TeacherShareNudge childId={childId} /> : null}
          <ItemResultsTable items={results.data.items} />
          <MasteryBySkill mastery={results.data.mastery} />
          <ReadingVsMathReadout readout={results.data.readingReadout} mastery={results.data.mastery} />
          <RecommendationsList recommendations={results.data.recommendations} activities={results.data.activities} />
          <CalibrationUpdate calibration={results.data.calibration} />

          {selectedId === latestCycleId ? (
            <section aria-labelledby="next-heading" className="flex flex-col gap-4">
              <h2 id="next-heading" className="text-h5">
                Next step
              </h2>
              <p className="max-w-prose text-body text-text-primary">
                Create the next worksheet. It’s set to the levels above.
              </p>
              <div>
                <Link
                  href={`/children/${childId}/plan`}
                  className={buttonStyles()}
                  onClick={() => track('next_sheet_started', { childId })}
                >
                  Next worksheet
                </Link>
              </div>
            </section>
          ) : null}

          {results.data.cycle.worksheetId ? (
            <RateWorksheet
              key={results.data.cycle.worksheetId}
              worksheetId={results.data.cycle.worksheetId}
              initial={results.data.feedback}
            />
          ) : null}

          <DisclosureBanner disclosure={results.data.disclosure} />
        </>
      )}
    </div>
  )
}
