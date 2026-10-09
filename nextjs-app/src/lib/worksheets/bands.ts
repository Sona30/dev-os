import type { ReadingBand } from '@/lib/schemas/common'
import { isKnownName } from './names'
import { countSyllables, numberWord, splitSentences, words } from './text'

// Reading-difficulty bands as readability constraints on the problem text (docs/specs/08 §4.4).
// The knowledge base can override these defaults. `maxLongWordRatio` is a proxy for vocabulary difficulty:
// the share of words with three or more syllables (names and number words excluded).

export interface BandRules {
  minSentences: number
  maxSentences: number
  maxWordsPerSentence: number
  maxLongWordRatio: number
  /** Longest name allowed, in syllables (only enforced for the earliest readers). */
  maxNameSyllables?: number
}

// R1 allows up to three sentences because a word problem needs a setup, an action and a question, and the words
// per sentence (not the sentence count) are what make a text hard for a new reader: three four-word sentences are
// easier than one nine-word sentence.
export const BAND_RULES: Record<ReadingBand, BandRules> = {
  R1: { minSentences: 1, maxSentences: 3, maxWordsPerSentence: 8, maxLongWordRatio: 0, maxNameSyllables: 2 },
  R2: { minSentences: 2, maxSentences: 3, maxWordsPerSentence: 10, maxLongWordRatio: 0.1 },
  R3: { minSentences: 3, maxSentences: 4, maxWordsPerSentence: 14, maxLongWordRatio: 0.2 },
  R4: { minSentences: 2, maxSentences: 5, maxWordsPerSentence: 16, maxLongWordRatio: 0.3 },
}

/** The gentlest R1 template, used for the "low reading" half of a diagnostic pair when the child is already R1. */
export const R1_MINIMAL_RULES: BandRules = {
  minSentences: 1,
  maxSentences: 3,
  maxWordsPerSentence: 6,
  maxLongWordRatio: 0,
  maxNameSyllables: 2,
}

export function rulesFor(band: ReadingBand, minimal = false): BandRules {
  return minimal && band === 'R1' ? R1_MINIMAL_RULES : BAND_RULES[band]
}

/** Returns the reasons a text does not fit the band (empty = it fits). */
export function checkReadability(text: string, band: ReadingBand, minimal = false): string[] {
  const rules = rulesFor(band, minimal)
  const reasons: string[] = []

  const sentences = splitSentences(text)
  if (sentences.length < rules.minSentences || sentences.length > rules.maxSentences) {
    reasons.push(
      `Has ${sentences.length} sentences; ${band}${minimal ? ' (minimal)' : ''} needs ${rules.minSentences}-${rules.maxSentences}.` +
        (sentences.length > rules.maxSentences
          ? ' Combine short sentences if you can, but keep every sentence within the word limit and the question last.'
          : ''),
    )
  }
  for (const sentence of sentences) {
    const count = words(sentence).length
    if (count > rules.maxWordsPerSentence) {
      reasons.push(`A sentence has ${count} words; the limit for ${band} is ${rules.maxWordsPerSentence}.`)
      break
    }
  }

  const candidateWords = words(text).filter(
    (word) => /^[A-Za-z]+$/.test(word) && !isKnownName(word) && !isNumberWord(word) && !MATH_TERMS.has(word.toLowerCase()),
  )
  if (candidateWords.length > 0) {
    const longWords = candidateWords.filter((word) => countSyllables(word) >= 3)
    if (longWords.length / candidateWords.length > rules.maxLongWordRatio) {
      reasons.push(`Uses too many long words for ${band} (${longWords.slice(0, 3).join(', ')}).`)
    }
  }

  if (rules.maxNameSyllables !== undefined) {
    const longName = words(text).find((word) => isKnownName(word) && countSyllables(word) > rules.maxNameSyllables!)
    if (longName) reasons.push(`The name "${longName}" is too long for ${band}.`)
  }
  return reasons
}

// Grade 1-2 math vocabulary that a problem cannot avoid, so it does not count as a "long word" for the band.
const MATH_TERMS = new Set([
  'rectangle', 'rectangles', 'triangle', 'triangles', 'hexagon', 'hexagons', 'trapezoid', 'trapezoids', 'cylinder',
  'cylinders', 'quadrilateral', 'quadrilaterals', 'centimeter', 'centimeters', 'subtract', 'subtraction', 'addition',
  'equation', 'equal', 'equals', 'fraction', 'fractions', 'measure', 'measures',
])

function isNumberWord(word: string): boolean {
  const lower = word.toLowerCase()
  for (let value = 0; value <= 100; value++) {
    if (numberWord(value) === lower) return true
  }
  return false
}
