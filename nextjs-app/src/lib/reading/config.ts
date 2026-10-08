import type { Grade, ReadingBand } from '@/lib/schemas/common'

// Reading-band defaults used when the knowledge base does not define them (docs/specs/02 §4.3).
// Grade defaults mirror Agent-Instructions §5: R2 = Grade 1 on level, R3 = Grade 2 on level.
export const GRADE_DEFAULT_BAND: Record<Grade, ReadingBand> = { 1: 'R2', 2: 'R3' }

export const BAND_ORDER: readonly ReadingBand[] = ['R1', 'R2', 'R3', 'R4']
