import type { Grade } from '@/lib/schemas/common'

// i-Ready placement labels and the grade check (docs/specs/06 §3). Client and server share this file.
// This is a default list; the SME-approved knowledge base can refine it. Unknown wording is allowed
// (districts vary) — only a placement that clearly belongs to the wrong grade is rejected.

export const RELATIVE_PLACEMENTS = [
  'On or Above Grade Level',
  'One Grade Level Below',
  'Two Grade Levels Below',
  'Three or More Grade Levels Below',
] as const

const SUBLEVELS = ['Early', 'Mid', 'Late'] as const

function gradeName(level: number): string {
  return level === 0 ? 'Kindergarten' : `Grade ${level}`
}

/** Grade levels a child in `grade` can plausibly place at: two below up to one above (docs/specs/06 §3). */
export function plausibleLevels(grade: Grade): number[] {
  const levels: number[] = []
  for (let level = Math.max(0, grade - 2); level <= grade + 1; level++) levels.push(level)
  return levels
}

/** Options for the placement drop-down, highest first. */
export function placementOptionsFor(grade: Grade): string[] {
  const options: string[] = []
  for (const level of plausibleLevels(grade).slice().reverse()) {
    for (const sub of SUBLEVELS) options.push(`${sub} ${gradeName(level)}`)
  }
  return [...options, ...RELATIVE_PLACEMENTS]
}

export type PlacementCheck = 'ok' | 'contradictory' | 'unknown'

export function checkPlacement(grade: Grade, text: string): PlacementCheck {
  const normalised = text.trim().replace(/\s+/g, ' ').toLowerCase()
  if (RELATIVE_PLACEMENTS.some((option) => option.toLowerCase() === normalised)) return 'ok'

  const match = /^(early|mid|late) (?:grade (\d{1,2})|kindergarten)$/.exec(normalised)
  if (!match) return 'unknown'
  const level = match[2] === undefined ? 0 : Number(match[2])
  return plausibleLevels(grade).includes(level) ? 'ok' : 'contradictory'
}
