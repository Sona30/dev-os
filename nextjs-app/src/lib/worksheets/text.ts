import { createHash } from 'node:crypto'
import { isKnownName } from './names'

// Text helpers for freshness checks and readability (docs/specs/08 §4.3-4.4). Pure and deterministic.

const NUMBER_WORDS: Record<number, string> = {
  0: 'zero', 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine',
  10: 'ten', 11: 'eleven', 12: 'twelve', 13: 'thirteen', 14: 'fourteen', 15: 'fifteen', 16: 'sixteen',
  17: 'seventeen', 18: 'eighteen', 19: 'nineteen', 20: 'twenty', 30: 'thirty', 40: 'forty', 50: 'fifty',
  60: 'sixty', 70: 'seventy', 80: 'eighty', 90: 'ninety', 100: 'one hundred',
}

export function numberWord(value: number): string | null {
  return NUMBER_WORDS[value] ?? null
}

export function words(text: string): string[] {
  return text.match(/[A-Za-z0-9'’]+/g) ?? []
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
}

/** Rough English syllable count: vowel groups, minus a silent final "e". Good enough to flag long words. */
export function countSyllables(word: string): number {
  const letters = word.toLowerCase().replace(/[^a-z]/g, '')
  if (letters.length === 0) return 0
  if (letters.length <= 3) return 1
  const groups = letters.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g)
  return Math.max(1, groups?.length ?? 1)
}

/** True when the number appears in the text as digits or as a number word (for example "3" or "three"). */
export function numberAppearsInText(value: number, text: string): boolean {
  const digitPattern = new RegExp(`(^|[^0-9])${value}([^0-9]|$)`)
  if (digitPattern.test(text)) return true
  const word = numberWord(value)
  return word !== null && new RegExp(`\\b${word}\\b`, 'i').test(text)
}

/** Lower-case, strip punctuation, collapse spaces, and replace known names so only the structure remains. */
export function normaliseQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (isKnownName(word) ? '<n>' : word))
    .join(' ')
}

export function questionHash(text: string): string {
  return createHash('sha256').update(normaliseQuestion(text)).digest('hex').slice(0, 32)
}

export function numberSetKey(numbers: number[]): string {
  return [...numbers].sort((a, b) => a - b).join(',')
}

export function contextStructureKey(context: string, structure: string): string {
  return `${context.trim().toLowerCase()}|${structure.trim().toLowerCase()}`
}

