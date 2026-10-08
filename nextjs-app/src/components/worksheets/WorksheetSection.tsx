'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PaywallDialog } from '@/components/pricing/PaywallDialog'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FocusPicker } from '@/components/worksheets/FocusPicker'
import { GeneratingPanel } from '@/components/worksheets/GeneratingPanel'
import { WorksheetPreview } from '@/components/worksheets/WorksheetPreview'
import { useEntitlements } from '@/hooks/use-entitlements'
import { ApiError, apiFetch } from '@/lib/client/api'
import type { DiagnosisGap } from '@/lib/diagnosis/types'
import type { WorksheetStateDto } from '@/lib/worksheets/types'

const MAX_FOCUS = 6

interface WorksheetSectionProps {
  childId: string
  diagnosisId: string
  gaps: DiagnosisGap[]
  initialState: WorksheetStateDto
}

/**
 * Everything after the gap analysis: choose a focus, generate, watch progress, then preview and download.
 * Which of these the parent sees is decided by the stored cycle, so a refresh resumes in the right place.
 */
export function WorksheetSection({ childId, diagnosisId, gaps, initialState }: WorksheetSectionProps) {
  const queryClient = useQueryClient()
  const stateKey = ['worksheet-state', childId] as const
  const { data: state = initialState } = useQuery({
    queryKey: stateKey,
    queryFn: () => apiFetch<WorksheetStateDto>(`/api/children/${childId}/worksheets`),
    initialData: initialState,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true, // keeps the download links fresh
  })
  const { data: entitlements } = useEntitlements()

  const [selected, setSelected] = useState<string[]>(() => gaps.slice(0, MAX_FOCUS).map((gap) => gap.skillId))
  const [startedJobId, setStartedJobId] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const [paywallOpen, setPaywallOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: stateKey })

  const start = useMutation({
    mutationFn: () =>
      apiFetch<{ jobId: string; cycleId: string }>(`/api/children/${childId}/worksheets`, {
        method: 'POST',
        body: { diagnosisId, focusSkillIds: selected },
      }),
    onSuccess: ({ jobId }) => {
      setStartedJobId(jobId)
      refresh()
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'PAYWALL') setPaywallOpen(true)
      else setStartError(error instanceof ApiError ? error.message : 'We couldn’t start the worksheet. Please try again.')
      if (error instanceof ApiError && error.code === 'CONFLICT') refresh()
    },
  })

  const cycle = state.cycle
  const generating = cycle?.status === 'generating'

  if (generating) {
    return (
      <GeneratingPanel
        jobId={startedJobId ?? cycle.generateJobId}
        onSuccess={() => {
          setStartedJobId(null)
          setNotice(null)
          refresh()
        }}
        onFailure={(job) => {
          // A final failure is settled by the server (cycle failed, or back to its previous worksheet after a
          // failed regeneration). Say so, because the progress panel disappears once the cycle changes.
          if (job.error && !job.error.retryable) {
            setStartedJobId(null)
            setNotice(job.error.message)
            refresh()
          }
        }}
      />
    )
  }

  if (state.detail && cycle && cycle.status !== 'failed') {
    return (
      <>
        {notice ? <Alert tone="warning" className="mb-6">{notice}</Alert> : null}
        <WorksheetPreview
          detail={state.detail}
          onChanged={refresh}
          onRegenerating={(jobId) => {
            setStartedJobId(jobId)
            refresh()
          }}
        />
        {cycle.status === 'complete' ? <StartPanelNote /> : null}
      </>
    )
  }

  const blocked = entitlements && !entitlements.canStartCycle ? entitlements.reason : undefined

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-h5">Create a worksheet</h2>
        <p className="max-w-prose text-body text-text-secondary">
          Up to 10 word problems, each set to a maths level and a reading level, with a separate answer key for you.
        </p>
      </div>

      {cycle?.status === 'failed' ? (
        <Alert tone="warning">
          {notice ?? 'The last attempt didn’t finish, so nothing was used up. You can try again.'}
        </Alert>
      ) : null}
      {startError ? <Alert tone="danger">{startError}</Alert> : null}
      {blocked === 'DAILY_CAP' ? (
        <Alert tone="info">You’ve reached today’s worksheet limit. Please come back tomorrow.</Alert>
      ) : null}

      <FocusPicker gaps={gaps} selected={selected} onChange={setSelected} />

      <div>
        <Button
          loading={start.isPending}
          disabled={selected.length === 0 || blocked === 'DAILY_CAP'}
          onClick={() => {
            setStartError(null)
            if (blocked === 'PAYWALL') setPaywallOpen(true)
            else start.mutate()
          }}
        >
          {start.isPending ? 'Starting…' : 'Generate worksheet'}
        </Button>
      </div>

      <PaywallDialog open={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </Card>
  )
}

function StartPanelNote() {
  return <p className="mt-6 text-caption text-text-secondary">This worksheet is finished. The next one will appear here.</p>
}
