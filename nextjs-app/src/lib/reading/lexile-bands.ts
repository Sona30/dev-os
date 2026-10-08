import type { ReadingBand } from '@/lib/schemas/common'

/**
 * Lexile → reading-band mapping.
 *
 * This is an APPROXIMATE default used until the SME-approved knowledge base provides its own
 * Lexile → R-band table (kb/iready_interpretation.md, loaded by `kb:build`). When that table exists
 * it replaces this file's `LEXILE_BAND_TABLE`. The UI labels the resulting band "approximate".
 */
export const LEXILE_BAND_TABLE_SOURCE = 'default-approximate' as const

/** Upper bound (inclusive) of each band, in ascending order. */
export const LEXILE_BAND_TABLE: ReadonlyArray<{ maxLexile: number; band: ReadingBand }> = [
  { maxLexile: 199, band: 'R1' },
  { maxLexile: 399, band: 'R2' },
  { maxLexile: 599, band: 'R3' },
  { maxLexile: Number.POSITIVE_INFINITY, band: 'R4' },
]
