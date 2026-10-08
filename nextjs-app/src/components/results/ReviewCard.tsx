'use client'

import { useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import type { ReviewItemDto } from '@/lib/grading/types'

interface ReviewCardProps {
  item: ReviewItemDto
  index: number
  total: number
  pending: boolean
  error: string | null
  onConfirm: (answer: string, leftBlank: boolean) => void
  onSkip: () => void
}

/** One doubtful answer: the picture of the handwriting beside our reading of it. One tap confirms. */
export function ReviewCard({ item, index, total, pending, error, onConfirm, onSkip }: ReviewCardProps) {
  const [answer, setAnswer] = useState(item.extractedAnswer ?? '')

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-h5">Question {item.position}</h3>
        <p className="text-caption text-text-secondary" aria-live="polite">
          {index + 1} of {total} to check
        </p>
      </div>

      <p className="text-body text-text-primary">{item.questionText}</p>

      {item.cropUrl ? (
        <div className="flex justify-center rounded-md border border-line bg-subtle p-2">
          {/* A short-lived signed link to a private image, so next/image optimisation does not apply. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.cropUrl}
            alt={`Your child’s handwritten answer for question ${item.position}`}
            className="max-h-48 w-auto object-contain"
          />
        </div>
      ) : (
        <Alert tone="info">We couldn’t make a picture of this answer. Please type what your child wrote.</Alert>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-body text-text-primary">
          We read this as: <strong>{item.extractedAnswer ?? 'nothing we could make out'}</strong>
        </p>
        {item.alternatives.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-caption text-text-secondary">Or is it:</span>
            {item.alternatives.map((alternative) => (
              <Button key={alternative} variant="secondary" size="sm" onClick={() => setAnswer(alternative)}>
                {alternative}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          onConfirm(answer, false)
        }}
      >
        <Field id={`review-answer-${item.gradedItemId}`} label="What did your child write?">
          <Input
            value={answer}
            maxLength={40}
            autoComplete="off"
            className="h-12"
            onChange={(event) => setAnswer(event.target.value)}
          />
        </Field>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button type="submit" loading={pending} className="h-12">
            Confirm
          </Button>
          <Button variant="secondary" className="h-12" disabled={pending} onClick={() => onConfirm('', true)}>
            They left it blank
          </Button>
          <Button variant="ghost" className="h-12" disabled={pending} onClick={onSkip}>
            Not sure — skip for now
          </Button>
        </div>
      </form>
    </Card>
  )
}
