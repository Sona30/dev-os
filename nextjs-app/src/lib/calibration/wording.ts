import type { CalibrationEvent, SkillResult } from './types'

// Plain-language wording around the engine's decisions (docs/specs/10 §7). The model may rephrase the result,
// but it may not change it: anything it writes that mentions a level we did not set is thrown away.

const LEVEL_TOKEN = /\b([MR])([1-4])\b/g
const LEVEL_WORDS = /\blevel\s+([1-4])\b/gi

/** The tokens ("M3", "R2", "3") that the engine's events legitimately mention. */
function allowedLevelTokens(events: CalibrationEvent[]): { tokens: Set<string>; digits: Set<string> } {
  const tokens = new Set<string>()
  const digits = new Set<string>()
  for (const event of events) {
    for (const value of [event.fromLevel, event.toLevel]) {
      tokens.add(value)
      const digit = value.match(/\d/)?.[0]
      if (digit) digits.add(digit)
    }
  }
  return { tokens, digits }
}

/** True if the explanation only mentions levels that appear in the events. */
export function explanationIsSafe(text: string, events: CalibrationEvent[]): boolean {
  const { tokens, digits } = allowedLevelTokens(events)
  for (const match of text.matchAll(LEVEL_TOKEN)) {
    if (!tokens.has(`${match[1]}${match[2]}`)) return false
  }
  for (const match of text.matchAll(LEVEL_WORDS)) {
    if (!digits.has(match[1] as string)) return false
  }
  return true
}

/** The plain template used when the model's explanation is unavailable or fails the check. */
export function templateExplanation(events: CalibrationEvent[]): string {
  if (events.length === 0) {
    return 'No levels change this time. The next worksheet keeps the same levels while we gather more evidence.'
  }
  return events.map((event) => event.reason).join(' ')
}

export interface SummaryCounts {
  total: number
  correct: number
  partial: number
  incorrect: number
  blank: number
  /** Answers the parent skipped or whose key was disputed. */
  notCounted: number
}

/** A short, encouraging summary that leads with what went well. */
export function buildSummary(nickname: string, counts: SummaryCounts, results: SkillResult[]): string {
  const sentences: string[] = [`${nickname} got ${counts.correct} of ${counts.total} questions right.`]

  const secure = results.filter((result) => result.label === 'secure').map((result) => result.skillName)
  if (secure.length > 0) sentences.push(`Clear strengths: ${secure.slice(0, 3).join(', ')}.`)

  const building = results
    .filter((result) => result.label === 'developing' || result.label === 'not_yet')
    .map((result) => result.skillName)
  if (building.length > 0) sentences.push(`Still building: ${building.slice(0, 3).join(', ')}.`)

  if (counts.notCounted > 0) {
    sentences.push(
      `${counts.notCounted} ${counts.notCounted === 1 ? 'question was' : 'questions were'} not counted towards levels.`,
    )
  }
  return sentences.join(' ')
}

/** Used when the model's recommendations are unavailable, so the page is never empty. */
export const FALLBACK_RECOMMENDATIONS = ['Keep each worksheet to about 15 to 20 minutes, with a break if needed.']
export const FALLBACK_ACTIVITIES = [
  'Count things together on a walk, such as steps, cars or birds.',
  'Tell a quick number story at dinner and let your child work out the answer.',
]
