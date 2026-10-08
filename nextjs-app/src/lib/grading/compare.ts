// Decides whether a child's handwritten answer matches the answer key (docs/specs/09 §4.4).
// The model reads the handwriting; this code makes the call on correctness, so grading never depends on the
// model's own arithmetic. Pure and deterministic.

export type AnswerType = 'integer' | 'text' | 'choice'
export type Comparison = { status: 'correct' | 'incorrect' | 'blank'; unitMissing: boolean }

export interface KeyAnswer {
  answerType: AnswerType
  correctAnswer: string
  acceptedAnswers: string[]
}

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19,
}
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
}

/** Replaces number words ("twelve", "twenty-one", "one hundred") with digits, leaving other words alone. */
export function wordsToDigits(text: string): string {
  const tokens = text.toLowerCase().replace(/-/g, ' ').split(/\s+/).filter(Boolean)
  const out: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as string
    if (token === 'one' && tokens[i + 1] === 'hundred') {
      out.push('100')
      i++
    } else if (token in TENS) {
      const next = tokens[i + 1]
      if (next !== undefined && next in ONES && (ONES[next] as number) >= 1 && (ONES[next] as number) <= 9) {
        out.push(String((TENS[token] as number) + (ONES[next] as number)))
        i++
      } else {
        out.push(String(TENS[token]))
      }
    } else if (token in ONES) {
      out.push(String(ONES[token]))
    } else {
      out.push(token)
    }
  }
  return out.join(' ')
}

function clean(text: string): string {
  return text
    .replace(/[−–—]/g, '-')
    .replace(/[×]/g, 'x')
    .trim()
    .toLowerCase()
}

export function isBlank(extracted: string | null | undefined): boolean {
  if (extracted === null || extracted === undefined) return true
  return clean(extracted).replace(/[\s.\-_–—]/g, '') === ''
}

/** The number a child meant: after an "=" if they wrote working, otherwise the last number written. */
export function numberFrom(extracted: string): number | null {
  const afterEquals = extracted.includes('=') ? (extracted.split('=').pop() ?? extracted) : extracted
  const matches = wordsToDigits(clean(afterEquals)).replace(/,/g, '').match(/\d+/g)
  if (!matches || matches.length === 0) return null
  return Number(matches[matches.length - 1])
}

function normaliseText(text: string): string {
  return wordsToDigits(clean(text))
    .replace(/[.,!?;:'"]/g, '')
    .replace(/\b(a|an|the)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function compareAnswer(extracted: string | null | undefined, key: KeyAnswer): Comparison {
  if (isBlank(extracted)) return { status: 'blank', unitMissing: false }
  const written = extracted as string

  if (key.answerType === 'integer') {
    const expected = Number(key.correctAnswer)
    const given = numberFrom(written)
    return { status: given !== null && given === expected ? 'correct' : 'incorrect', unitMissing: false }
  }

  if (key.answerType === 'choice') {
    const letter = clean(written).match(/[a-d]/)?.[0]
    const expected = clean(key.correctAnswer).match(/[a-d]/)?.[0]
    return { status: letter !== undefined && letter === expected ? 'correct' : 'incorrect', unitMissing: false }
  }

  const normalised = normaliseText(written)
  const accepted = [key.correctAnswer, ...key.acceptedAnswers].map(normaliseText)
  if (accepted.includes(normalised)) return { status: 'correct', unitMissing: false }

  // The right number without the unit the key expects (for example "7" for "7 apples") is partly right.
  const numberOnly = normalised.match(/^\d+$/)
  if (numberOnly) {
    const withUnit = accepted.some((answer) => answer.startsWith(`${normalised} `) && /^\d+\s+[a-z]/.test(answer))
    if (withUnit) return { status: 'correct', unitMissing: true }
  }
  return { status: 'incorrect', unitMissing: false }
}

// Digits young children commonly mix up when writing or when a photo is unclear.
const CONFUSIONS: Record<string, string[]> = {
  '0': ['6'], '1': ['7'], '3': ['8'], '5': ['6'], '6': ['5', '9', '0'], '7': ['1'], '8': ['3'], '9': ['6'],
}

/** Up to two likely alternatives for an unclear number ("12" → "17"), shown as one-tap choices in the review queue. */
export function confusionAlternatives(extracted: string | null | undefined): string[] {
  if (!extracted || !/^\d{1,3}$/.test(extracted.trim())) return []
  const original = extracted.trim()
  const alternatives: string[] = []
  for (let index = original.length - 1; index >= 0; index--) {
    for (const swap of CONFUSIONS[original[index] as string] ?? []) {
      const candidate = original.slice(0, index) + swap + original.slice(index + 1)
      if (candidate !== original && !alternatives.includes(candidate)) alternatives.push(candidate)
      if (alternatives.length === 2) return alternatives
    }
  }
  return alternatives
}
