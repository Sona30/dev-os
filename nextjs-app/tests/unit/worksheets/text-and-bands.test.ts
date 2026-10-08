import { describe, expect, it } from 'vitest'
import { checkReadability } from '@/lib/worksheets/bands'
import { makeSheetId, sheetNamePart } from '@/lib/worksheets/sheet-id'
import {
  countSyllables,
  numberAppearsInText,
  numberSetKey,
  questionHash,
  splitSentences,
} from '@/lib/worksheets/text'
import { toWinAnsi } from '@/lib/worksheets/pdf/winansi'

describe('text helpers', () => {
  it('counts syllables roughly', () => {
    expect(countSyllables('cat')).toBe(1)
    expect(countSyllables('apple')).toBe(2)
    expect(countSyllables('elephant')).toBe(3)
    expect(countSyllables('banana')).toBe(3)
  })
  it('splits sentences', () => {
    expect(splitSentences('Mia has 3 pens. She buys 2 more. How many?')).toHaveLength(3)
  })
  it('finds a number as digits or as a word, but not inside a bigger number', () => {
    expect(numberAppearsInText(3, 'Mia has 3 pens')).toBe(true)
    expect(numberAppearsInText(3, 'Mia has three pens')).toBe(true)
    expect(numberAppearsInText(3, 'Mia has 13 pens')).toBe(false)
    expect(numberAppearsInText(3, 'Mia has 30 pens')).toBe(false)
  })
  it('hashes questions by structure, so only the name differs', () => {
    expect(questionHash('Mia has 4 ducks.')).toBe(questionHash('Omar has 4 ducks!'))
    expect(questionHash('Mia has 4 ducks.')).not.toBe(questionHash('Mia has 5 ducks.'))
  })
  it('builds an order-independent number set key', () => {
    expect(numberSetKey([5, 2, 9])).toBe('2,5,9')
  })
})

describe('checkReadability', () => {
  it('accepts a simple R2 problem', () => {
    expect(checkReadability('Mia has 3 pens. She gets 2 more. How many pens now?', 'R2')).toEqual([])
  })
  it('rejects a sentence that is too long for R1', () => {
    const reasons = checkReadability('Mia has three red pens and she buys two more.', 'R1')
    expect(reasons.some((reason) => reason.includes('the limit'))).toBe(true)
  })
  it('rejects long words for R1', () => {
    const reasons = checkReadability('Mia likes watermelon.', 'R1')
    expect(reasons.some((reason) => reason.includes('long words'))).toBe(true)
  })
  it('rejects too few sentences for R3', () => {
    expect(checkReadability('Mia has 3 pens.', 'R3').length).toBeGreaterThan(0)
  })
})

describe('sheet ids', () => {
  it('keeps letters and digits only, folding accents, at most 8 characters', () => {
    expect(sheetNamePart('Maya')).toBe('Maya')
    expect(sheetNamePart('José-Luis')).toBe('JoseLuis')
    expect(sheetNamePart('Alexander')).toBe('Alexande')
  })
  it('falls back when nothing usable is left', () => {
    expect(sheetNamePart('')).toBe('child')
    expect(sheetNamePart('!!!')).toBe('child')
  })
  it('makes ids that satisfy the database constraint', () => {
    const pattern = /^TR-[A-Za-z0-9]{1,12}-C[0-9]{1,4}-[A-Z0-9]{4}$/
    for (let i = 0; i < 50; i++) expect(makeSheetId('Maya', 3)).toMatch(pattern)
  })
  it('never uses look-alike characters in the suffix', () => {
    for (let i = 0; i < 100; i++) {
      const suffix = makeSheetId('Maya', 1).split('-')[3] as string
      expect(suffix).not.toMatch(/[01OI]/)
    }
  })
})

describe('toWinAnsi', () => {
  it('maps typographic characters to safe equivalents', () => {
    expect(toWinAnsi('“Hi” — it’s 3 × 4…')).toBe('"Hi" - it\'s 3 x 4...')
  })
  it('replaces characters the font cannot draw, so the PDF library never throws', () => {
    expect(toWinAnsi('smile 😀')).not.toMatch(/[^ -ÿ]/)
  })
})
