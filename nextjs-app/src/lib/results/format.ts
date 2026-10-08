import type { ErrorType, ItemStatus } from '@/lib/grading/types'
import type { Trend } from './types'

// Parent-facing wording. Encouraging and specific; never labels the child ("still building", "next step").

export const RESULT_LABEL: Record<ItemStatus, string> = {
  correct: 'Got it',
  partial: 'Nearly there',
  incorrect: 'Still building',
  blank: 'Left blank',
}

export const ERROR_LABEL: Record<ErrorType, string> = {
  calculation_slip: 'A small slip',
  concept_gap: 'The idea is still forming',
  reading_difficulty: 'The wording was tricky',
  attention_copying: 'Copying or space on the page',
  unclear: 'Not sure why',
}

export const TREND_LABEL: Record<NonNullable<Trend>, string> = {
  improving: 'Improving',
  steady: 'Steady',
  slipping: 'Needs another look',
}

export function formatDate(iso: string | null): string {
  if (!iso) return ''
  // UTC keeps the server and the browser rendering the same text.
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export function confidenceLabel(value: number): string {
  if (value >= 0.85) return 'Clear'
  if (value >= 0.6) return 'Fairly clear'
  return 'Hard to read'
}
