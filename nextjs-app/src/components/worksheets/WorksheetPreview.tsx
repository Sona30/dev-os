'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { DifficultyFeedback } from '@/components/worksheets/DifficultyFeedback'
import { FlagKeyForm } from '@/components/worksheets/FlagKeyForm'
import { PaperSizeToggle } from '@/components/worksheets/PaperSizeToggle'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button, buttonStyles } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ApiError, apiFetch } from '@/lib/client/api'
import { track } from '@/lib/client/track'
import type { WorksheetDetailDto } from '@/lib/worksheets/types'

interface WorksheetPreviewProps {
  detail: WorksheetDetailDto
  /** Called after something changed on the server (new paper size, regeneration started). */
  onChanged: () => void
  onRegenerating: (jobId: string) => void
}

/** The finished worksheet: what the child will see (no answers), downloads, and the parent's controls. */
export function WorksheetPreview({ detail, onChanged, onRegenerating }: WorksheetPreviewProps) {
  const { worksheet, items } = detail
  const [readAloud, setReadAloud] = useState(detail.readAloud)
  const [error, setError] = useState<string | null>(null)
  const regenerated = detail.regenerationsUsed >= 1
  const canChange = detail.cycleStatus === 'ready'

  const regenerate = useMutation({
    mutationFn: () => apiFetch<{ jobId: string }>(`/api/worksheets/${worksheet.id}/regenerate`, { method: 'POST' }),
    onSuccess: ({ jobId }) => onRegenerating(jobId),
    onError: (failure) => setError(failure instanceof ApiError ? failure.message : 'We couldn’t regenerate the worksheet.'),
  })

  const updateReadAloud = useMutation({
    mutationFn: (value: boolean) =>
      apiFetch(`/api/cycles/${worksheet.cycleId}`, { method: 'PATCH', body: { readAloud: value } }),
    onMutate: (value) => setReadAloud(value),
    onError: (failure, value) => {
      setReadAloud(!value)
      setError(failure instanceof ApiError ? failure.message : 'We couldn’t save that.')
    },
  })

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="ws-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="ws-heading" className="text-h5">
            Your worksheet is ready
          </h2>
          <Badge tone="success">Answers checked</Badge>
          <Badge>Sheet {worksheet.sheetId}</Badge>
        </div>
        <p className="max-w-prose text-body text-text-secondary">
          {worksheet.itemCount} questions across {worksheet.domainCount} {worksheet.domainCount === 1 ? 'area' : 'areas'}.
          Print the student sheet for your child, and keep the parent answer key for yourself.
        </p>

        <div className="flex flex-wrap gap-2">
          <a
            href={detail.studentPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonStyles()}
            onClick={() => track('worksheet_printed', { childId: worksheet.childId })}
          >
            <Download className="h-5 w-5" aria-hidden="true" />
            Student sheet (PDF)
          </a>
          <a
            href={detail.keyPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonStyles({ variant: 'secondary' })}
          >
            <Download className="h-5 w-5" aria-hidden="true" />
            Parent answer key (PDF)
          </a>
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </section>

      <section aria-labelledby="preview-heading" className="flex flex-col gap-4">
        <h3 id="preview-heading" className="text-h5">
          What your child will see
        </h3>
        <Card>
          <ol className="m-0 flex list-none flex-col gap-4 p-0">
            {items.map((item) => (
              <li key={item.id} className="flex gap-3 border-b border-line pb-4 last:border-b-0 last:pb-0">
                <span className="w-6 shrink-0 text-body text-text-primary">{item.position}.</span>
                <span className="text-body text-text-primary">{item.questionText}</span>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      <section aria-labelledby="print-heading" className="flex flex-col gap-4">
        <h3 id="print-heading" className="text-h5">
          Before you print
        </h3>
        <ul className="m-0 flex max-w-prose list-disc flex-col gap-1 pl-5 text-body text-text-secondary">
          <li>It prints in black and white, with big text and room to show work.</li>
          <li>Allow 15 to 25 minutes in one sitting. A break is fine.</li>
          <li>Please don’t coach during the sheet. It works best when it shows what your child can do alone.</li>
        </ul>

        <div className="flex max-w-prose items-start gap-3">
          <input
            id="read-aloud"
            type="checkbox"
            checked={readAloud}
            disabled={!canChange}
            onChange={(event) => updateReadAloud.mutate(event.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
          />
          <label htmlFor="read-aloud" className="text-body text-text-primary">
            I read the questions aloud. We’ll keep this sheet out of the reading level so it stays accurate.
          </label>
        </div>

        <div className="max-w-xs">
          <PaperSizeToggle worksheetId={worksheet.id} paperSize={worksheet.paperSize} onChanged={onChanged} />
        </div>
      </section>

      {canChange ? (
        <section aria-labelledby="adjust-heading" className="flex flex-col gap-4">
          <h3 id="adjust-heading" className="text-h5">
            Not quite right?
          </h3>
          <DifficultyFeedback cycleId={worksheet.cycleId} initial={detail.difficultyFeedback} />
          <div className="flex flex-col gap-2">
            <div>
              <Button
                variant="secondary"
                disabled={regenerated}
                loading={regenerate.isPending}
                onClick={() => {
                  setError(null)
                  regenerate.mutate()
                }}
              >
                Write a different worksheet
              </Button>
            </div>
            <p className="text-caption text-text-secondary">
              {regenerated
                ? 'You’ve used the one regeneration for this worksheet.'
                : 'You can do this once. Your current worksheet stays available until the new one is ready.'}
            </p>
          </div>
          <FlagKeyForm worksheetId={worksheet.id} items={items} />
        </section>
      ) : null}

      <p className="max-w-prose text-body text-text-primary">
        Next step: your child completes the sheet on paper, then you{' '}
        <Link href={`/children/${worksheet.childId}/results`} className="text-brand underline">
          add a photo of it on the Results tab
        </Link>
        .
      </p>
    </div>
  )
}
