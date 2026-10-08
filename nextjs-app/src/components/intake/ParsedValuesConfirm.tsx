'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ConfidenceBadge } from '@/components/intake/ConfidenceBadge'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ApiError, apiFetch } from '@/lib/client/api'
import { track } from '@/lib/client/track'
import { placementOptionsFor } from '@/lib/reports/placements'
import type { ReportDto } from '@/lib/reports/types'
import type { Grade } from '@/lib/schemas/common'
import { confirmedValuesSchema, type ConfirmedValues } from '@/lib/schemas/reports'

interface ParsedValuesConfirmProps {
  report: ReportDto
  grade: Grade
  onConfirmed: (result: { report: ReportDto; jobId: string | null }) => void
}

type FieldErrors = Partial<Record<'overallScore' | 'placement' | 'lexile' | 'form' | `domain-${number}`, string>>

const toText = (value: number | null) => (value === null ? '' : String(value))

function parseWhole(text: string): number | null | 'invalid' {
  const trimmed = text.trim()
  if (trimmed === '') return null
  return /^\d+$/.test(trimmed) ? Number(trimmed) : 'invalid'
}

/**
 * "Check these values": every number we read is editable, doubtful ones are flagged, unreadable ones are blank.
 * Nothing is analysed until the parent ticks the box and continues (US-008, FR-03).
 */
export function ParsedValuesConfirm({ report, grade, onConfirmed }: ParsedValuesConfirmProps) {
  const draft = report.draft
  const [testWindow, setTestWindow] = useState(draft?.values.window ?? '')
  const [overallScore, setOverallScore] = useState(toText(draft?.values.overallScore ?? null))
  const [placement, setPlacement] = useState(draft?.values.placement ?? '')
  const [lexile, setLexile] = useState(toText(draft?.values.lexile ?? null))
  const [domains, setDomains] = useState(
    (draft?.values.domainResults ?? []).map((domain) => ({
      domain: domain.domain,
      placement: domain.placement ?? '',
      score: toText(domain.score),
    })),
  )
  const [ticked, setTicked] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})

  const placementChoices = (current: string) => {
    const options = placementOptionsFor(grade)
    // Keep wording exactly as printed on the report even if it is not in our list.
    return current !== '' && !options.includes(current) ? [current, ...options] : options
  }

  const confirm = useMutation({
    mutationFn: (values: ConfirmedValues) =>
      apiFetch<{ report: ReportDto; jobId: string | null }>(`/api/reports/${report.id}/confirm`, {
        method: 'POST',
        body: { values },
      }),
    onSuccess: (result) => {
      track('score_entered', { childId: report.childId })
      onConfirmed(result)
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'CONTRADICTORY_INPUT') {
        setErrors({ placement: error.message })
      } else {
        setErrors({ form: error instanceof ApiError ? error.message : 'We couldn’t save that. Please try again.' })
      }
    },
  })

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const next: FieldErrors = {}

    const score = parseWhole(overallScore)
    if (score === 'invalid') next.overallScore = 'Enter a whole number'
    const lexileValue = parseWhole(lexile)
    if (lexileValue === 'invalid') next.lexile = 'Enter a whole number from 0 to 1500'

    const domainResults = domains.map((domain, index) => {
      const domainScore = parseWhole(domain.score)
      if (domainScore === 'invalid') next[`domain-${index}`] = 'Enter a whole number for the score'
      return {
        domain: domain.domain,
        placement: domain.placement === '' ? null : domain.placement,
        score: domainScore === 'invalid' ? null : domainScore,
      }
    })

    if (score === 'invalid' || lexileValue === 'invalid' || Object.keys(next).length > 0) {
      setErrors(next)
      return
    }

    const parsed = confirmedValuesSchema.safeParse({
      window: testWindow === '' ? null : testWindow,
      overallScore: score,
      placement: placement === '' ? null : placement,
      domainResults,
      lexile: lexileValue,
    })
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const key = issue?.path[0]
      setErrors(
        key === 'overallScore' || key === 'placement' || key === 'lexile'
          ? { [key]: issue?.message }
          : { form: issue?.message ?? 'Please check the values.' },
      )
      return
    }

    setErrors({})
    confirm.mutate(parsed.data)
  }

  const states = draft?.fieldStates

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-h5">Check these values</h2>
        <p className="text-body text-text-secondary">
          You know your child’s report best. Fix anything that’s wrong, and fill in anything we couldn’t read.
        </p>
      </div>

      {errors.form ? <Alert tone="danger">{errors.form}</Alert> : null}

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Field id="confirm-window" label="When was the test taken?">
            <Select value={testWindow} onChange={(event) => setTestWindow(event.target.value as typeof testWindow)}>
              <option value="">Not shown</option>
              <option value="BOY">Beginning of year</option>
              <option value="MOY">Middle of year</option>
              <option value="EOY">End of year</option>
            </Select>
          </Field>
          {states ? <ConfidenceBadge state={states.window} /> : null}
        </div>

        <div className="flex flex-col gap-1">
          <Field id="confirm-score" label="Overall scale score" error={errors.overallScore}>
            <Input inputMode="numeric" autoComplete="off" value={overallScore} onChange={(event) => setOverallScore(event.target.value)} />
          </Field>
          {states ? <ConfidenceBadge state={states.overallScore} /> : null}
        </div>

        <div className="flex flex-col gap-1">
          <Field id="confirm-placement" label="Overall placement" error={errors.placement}>
            <Select value={placement} onChange={(event) => setPlacement(event.target.value)}>
              <option value="">Not shown</option>
              {placementChoices(placement).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </Field>
          {states ? <ConfidenceBadge state={states.placement} /> : null}
        </div>
      </div>

      {domains.length > 0 ? (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-body text-text-primary">Results by domain</legend>
          {states ? <ConfidenceBadge state={states.domains} /> : null}
          {domains.map((domain, index) => (
            <div key={domain.domain} className="grid grid-cols-1 gap-4 rounded-lg border border-line bg-canvas p-4 sm:grid-cols-2">
              <p className="text-body text-text-primary sm:col-span-2">{domain.domain}</p>
              <Field id={`confirm-domain-${index}-placement`} label="Placement">
                <Select
                  value={domain.placement}
                  onChange={(event) =>
                    setDomains((current) => current.map((item, i) => (i === index ? { ...item, placement: event.target.value } : item)))
                  }
                >
                  <option value="">Not shown</option>
                  {placementChoices(domain.placement).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id={`confirm-domain-${index}-score`} label="Score (if shown)" error={errors[`domain-${index}`]}>
                <Input
                  inputMode="numeric"
                  autoComplete="off"
                  value={domain.score}
                  onChange={(event) =>
                    setDomains((current) => current.map((item, i) => (i === index ? { ...item, score: event.target.value } : item)))
                  }
                />
              </Field>
            </div>
          ))}
        </fieldset>
      ) : null}

      <Field
        id="confirm-lexile"
        label="Lexile score (optional)"
        hint="From the i-Ready Reading report. If you skip it, we’ll start with a gentle reading level and adjust."
        error={errors.lexile}
      >
        <Input inputMode="numeric" autoComplete="off" value={lexile} onChange={(event) => setLexile(event.target.value)} />
      </Field>

      <div className="flex items-start gap-3">
        <input
          id="confirm-tick"
          type="checkbox"
          checked={ticked}
          onChange={(event) => setTicked(event.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
        />
        <label htmlFor="confirm-tick" className="text-body text-text-primary">
          These values match my child’s report.
        </label>
      </div>

      <div>
        <Button type="submit" disabled={!ticked} loading={confirm.isPending}>
          {confirm.isPending ? 'Saving…' : 'Continue'}
        </Button>
      </div>
    </form>
  )
}
