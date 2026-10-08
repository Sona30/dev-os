import type { Metadata } from 'next'
import { ResultsFlow } from '@/components/results/ResultsFlow'
import { ResultsView } from '@/components/results/ResultsView'
import { requireChild } from '@/lib/children/children.service'
import { getGradingState } from '@/lib/grading/grading.service'
import { getResults, listCycles } from '@/lib/results/results.service'
import { childIdParams } from '@/lib/schemas/children'
import { createServerClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'Results' }
export const dynamic = 'force-dynamic'

export default async function ResultsPage({ params }: { params: { childId: string } }) {
  const { childId } = childIdParams.parse(params)
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = createServerClient()
  await requireChild(supabase, childId)
  const state = await getGradingState(supabase, childId)

  const cycles = await listCycles(supabase, childId)
  const latestComplete = cycles[0]
  const results = latestComplete ? await getResults(supabase, user.id, latestComplete.id) : null
  const currentIsComplete = state.cycle?.status === 'complete'

  return (
    <div className="flex flex-col gap-12">
      {/* The step in progress: add a photo, checking, review. Hidden once the latest sheet is fully done. */}
      {!currentIsComplete ? (
        <div className="max-w-2xl">
          <ResultsFlow childId={childId} initialState={state} />
        </div>
      ) : null}

      {results && latestComplete ? (
        <section aria-label="Results" className="flex flex-col gap-6">
          {!currentIsComplete ? (
            <h2 className="text-h4 border-t border-line pt-10">Previous worksheet results</h2>
          ) : null}
          <ResultsView childId={childId} cycles={cycles} initial={results} latestCycleId={state.cycle?.id ?? null} />
        </section>
      ) : null}
    </div>
  )
}
