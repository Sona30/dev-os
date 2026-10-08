import type { Grade, ReadingBand } from '@/lib/schemas/common'
import { BAND_ORDER, GRADE_DEFAULT_BAND } from './config'
import { LEXILE_BAND_TABLE } from './lexile-bands'

export interface ReadingBandResult {
  band: ReadingBand
  /** True when the band is a conservative estimate rather than derived from a measured Lexile (FR-18). */
  estimated: boolean
}

function oneBandBelow(band: ReadingBand): ReadingBand {
  const index = BAND_ORDER.indexOf(band)
  return BAND_ORDER[Math.max(0, index - 1)] ?? band
}

/**
 * With a Lexile: map it through the table (measured, estimated=false).
 * Without one: start one band below the grade default so the first worksheet is not too hard,
 * and mark it "estimated" so it is never presented as a measured value.
 */
export function deriveReadingBand(grade: Grade, lexile: number | null): ReadingBandResult {
  if (lexile !== null) {
    const entry = LEXILE_BAND_TABLE.find((row) => lexile <= row.maxLexile)
    return { band: entry?.band ?? 'R4', estimated: false }
  }
  return { band: oneBandBelow(GRADE_DEFAULT_BAND[grade]), estimated: true }
}
