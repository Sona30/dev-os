'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { GradingPanel } from '@/components/results/GradingPanel'
import { RecalibratePanel } from '@/components/results/RecalibratePanel'
import { ReviewQueue } from '@/components/results/ReviewQueue'
import { SheetMismatchPrompt } from '@/components/results/SheetMismatchPrompt'
import { SheetPhotoUpload, type Submission } from '@/components/results/SheetPhotoUpload'
import { buttonStyles } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { apiFetch } from '@/lib/client/api'
import type { GradingStateDto } from '@/lib/grading/types'
import type { JobDto } from '@/lib/jobs/types'

interface MismatchState {
  readSheetId: string | null
  expectedSheetId: string
}

interface ResultsFlowProps {
  childId: string
  initialState: GradingStateDto
}

const PHOTO_ADVICE =
  'That photo was too blurry, dark or cut off to read, so we deleted it. Please take another with the whole page in view and good light.'

/**
 * Screen 3, first half: photograph the sheet → we read it → the parent confirms anything doubtful.
 * The step shown comes from the stored cycle, so a refresh resumes exactly where the parent left off.
 */
export function ResultsFlow({ childId, initialState }: ResultsFlowProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const stateKey = ['grading-state', childId] as const
  const { data: state = initialState } = useQuery({
    queryKey: stateKey,
    queryFn: () => apiFetch<GradingStateDto>(`/api/children/${childId}/grading`),
    initialData: initialState,
    staleTime: 0,
  })

  const [submission, setSubmission] = useState<Submission | null>(null)
  const [mismatch, setMismatch] = useState<MismatchState | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: stateKey })
  const { cycle, worksheet } = state

  if (!cycle || !worksheet) {
    return (
      <EmptyState
        title="No worksheet to check yet"
        description="Create a worksheet first, print it, and have your child complete it. Then come back here to add a photo."
        action={
          <Link href={`/children/${childId}/plan`} className={buttonStyles()}>
            Go to the gap analysis
          </Link>
        }
      />
    )
  }

  if (cycle.status === 'generating') {
    return (
      <EmptyState
        title="Your worksheet is still being created"
        description="It will be ready in a moment."
        action={
          <Link href={`/children/${childId}/plan`} className={buttonStyles()}>
            See its progress
          </Link>
        }
      />
    )
  }

  if (cycle.status === 'grading') {
    return (
      <GradingPanel
        jobId={submission?.jobId ?? cycle.gradeJobId}
        onSuccess={(job: JobDto) => {
          const result = job.result as { needsSheetConfirmation?: boolean; readSheetId?: string | null; expectedSheetId?: string } | null
          if (result?.needsSheetConfirmation && result.expectedSheetId) {
            setMismatch({ readSheetId: result.readSheetId ?? null, expectedSheetId: result.expectedSheetId })
          }
          refresh()
        }}
        onFailure={(job: JobDto) => {
          if (job.error?.code === 'PHOTO_QUALITY') {
            setNotice(PHOTO_ADVICE)
            setSubmission(null)
          }
          if (job.error && !job.error.retryable) refresh()
        }}
      />
    )
  }

  if (cycle.status === 'needs_review') {
    return <ReviewQueue cycleId={cycle.id} onFinished={refresh} />
  }

  if (cycle.status === 'graded') {
    return (
      <RecalibratePanel
        cycleId={cycle.id}
        jobId={cycle.recalibrateJobId}
        onDone={() => {
          refresh()
          // The results page is rendered on the server once the cycle is complete.
          router.refresh()
        }}
      />
    )
  }

  if (cycle.status === 'complete') {
    // Normally the server renders the full results instead; this covers the moment between the two.
    return (
      <p className="text-body text-text-secondary" role="status">
        Opening your results…
      </p>
    )
  }

  // 'ready': waiting for the photo (or for the parent to settle a Sheet ID mismatch).
  if (mismatch && submission) {
    return (
      <SheetMismatchPrompt
        worksheetId={worksheet.id}
        readSheetId={mismatch.readSheetId}
        expectedSheetId={mismatch.expectedSheetId}
        submission={submission}
        onResubmitted={(next) => {
          setSubmission(next)
          setMismatch(null)
          refresh()
        }}
        onRetake={() => {
          // The earlier photos stay private and are removed automatically after 30 days; delete them now.
          submission.uploadIds.forEach((id) => void apiFetch(`/api/uploads/${id}`, { method: 'DELETE' }).catch(() => undefined))
          setMismatch(null)
          setSubmission(null)
        }}
      />
    )
  }

  return (
    <SheetPhotoUpload
      childId={childId}
      worksheetId={worksheet.id}
      sheetId={worksheet.sheetId}
      readAloudDefault={cycle.readAloud}
      notice={notice}
      onSubmitted={(next) => {
        setNotice(null)
        setSubmission(next)
        refresh()
      }}
    />
  )
}
