'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { JobProgress } from '@/components/jobs/JobProgress'
import { ParsedValuesConfirm } from '@/components/intake/ParsedValuesConfirm'
import { ResultInput, type InputTab } from '@/components/intake/ResultInput'
import { DiagnoseRunner } from '@/components/plan/DiagnoseRunner'
import { Alert } from '@/components/ui/Alert'
import { Button, buttonStyles } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useJob, useRetryJob } from '@/hooks/use-job'
import { apiFetch } from '@/lib/client/api'
import type { ReportDto } from '@/lib/reports/types'
import type { Grade } from '@/lib/schemas/common'

type Phase = 'input' | 'parsing' | 'confirm' | 'diagnosing' | 'done'

interface SetupFlowProps {
  child: { id: string; nickname: string; grade: Grade }
  initialReport: ReportDto | null
}

/** Which step the parent is on, decided from what is already stored — so a refresh or a return visit resumes correctly. */
function phaseFor(report: ReportDto | null): Phase {
  if (!report) return 'input'
  if (report.confirmedAt) return report.hasDiagnosis ? 'done' : 'diagnosing'
  if (report.parseStatus === 'pending') return 'parsing'
  if (report.parseStatus === 'failed') return 'input'
  return 'confirm'
}

export function SetupFlow({ child, initialReport }: SetupFlowProps) {
  const router = useRouter()
  const [report, setReport] = useState<ReportDto | null>(initialReport)
  const [phase, setPhase] = useState<Phase>(phaseFor(initialReport))
  const [tab, setTab] = useState<InputTab>('upload')
  const [parseJobId, setParseJobId] = useState<string | null>(initialReport?.parseJobId ?? null)
  const [diagnoseJobId, setDiagnoseJobId] = useState<string | null>(initialReport?.diagnoseJobId ?? null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const retry = useRetryJob()

  async function loadReport(reportId: string) {
    try {
      const fresh = await apiFetch<ReportDto>(`/api/reports/${reportId}`)
      setReport(fresh)
      setPhase(phaseFor(fresh))
      if (fresh.parseStatus === 'failed') setTab('manual')
      setLoadError(null)
    } catch {
      setLoadError('We couldn’t load your report. Please refresh the page.')
    }
  }

  const parse = useJob(phase === 'parsing' ? parseJobId : null, {
    onSuccess: () => report && void loadReport(report.id),
  })

  const goToPlan = () => {
    router.push(`/children/${child.id}/plan`)
    router.refresh()
  }

  const rejected = report?.parseStatus === 'failed' && phase === 'input'

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {loadError ? <Alert tone="danger">{loadError}</Alert> : null}

      {phase === 'input' ? (
        <>
          <div className="flex flex-col gap-2">
            <h2 className="text-h5">Enter {child.nickname}’s i-Ready Math result</h2>
            <p className="text-body text-text-secondary">
              The report works best because it lets us target exact concepts. An overall score or placement is enough
              to start.
            </p>
          </div>
          {rejected ? (
            <Alert tone="warning">
              {report?.rejectReason ?? 'That doesn’t look like an i-Ready Math report.'} You can try another file, or
              enter the score or placement by hand.
            </Alert>
          ) : null}
          <ResultInput
            childId={child.id}
            grade={child.grade}
            tab={tab}
            onTabChange={setTab}
            onUploadStarted={({ reportId, jobId }) => {
              setParseJobId(jobId)
              setPhase('parsing')
              void apiFetch<ReportDto>(`/api/reports/${reportId}`).then(setReport, () =>
                setLoadError('We couldn’t load your report. Please refresh the page.'),
              )
            }}
            onManualCreated={(created) => {
              setReport(created)
              setPhase('confirm')
            }}
          />
        </>
      ) : null}

      {phase === 'parsing' ? (
        <Card className="flex flex-col gap-4">
          <h2 className="text-h5">Reading your report</h2>
          <JobProgress
            type="parse_report"
            job={parse.job}
            connectionLost={parse.connectionLost}
            onRecheck={parse.recheck}
            onRetry={() => parseJobId && retry.mutate(parseJobId)}
            retrying={retry.isPending}
          />
          {parse.job?.status === 'failed' ? (
            <div>
              <Button
                variant="secondary"
                onClick={() => {
                  setTab('manual')
                  setPhase('input')
                }}
              >
                Enter the values by hand instead
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}

      {phase === 'confirm' && report ? (
        <ParsedValuesConfirm
          report={report}
          grade={child.grade}
          onConfirmed={({ report: confirmed, jobId }) => {
            setReport(confirmed)
            setDiagnoseJobId(jobId)
            setPhase(confirmed.hasDiagnosis ? 'done' : 'diagnosing')
          }}
        />
      ) : null}

      {phase === 'diagnosing' && report ? (
        <Card className="flex flex-col gap-4">
          <h2 className="text-h5">Finding what to practise</h2>
          <DiagnoseRunner childId={child.id} reportId={report.id} jobId={diagnoseJobId} onDone={goToPlan} />
        </Card>
      ) : null}

      {phase === 'done' && report ? (
        <Card className="flex flex-col gap-4">
          <h2 className="text-h5">Result saved</h2>
          <p className="text-body text-text-secondary">
            {child.nickname}’s result is confirmed and the gap analysis is ready.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/children/${child.id}/plan`} className={buttonStyles()}>
              See the gap analysis
            </Link>
            <Button variant="secondary" onClick={() => setPhase('input')}>
              Enter a newer result
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  )
}
