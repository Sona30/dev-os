import type { Grade, ReadingBand } from '@/lib/schemas/common'

// Shared by server and client: the wire shape of a child (docs/specs/02-children.md §3).
export interface ChildDto {
  id: string
  nickname: string
  grade: Grade
  lexile: number | null
  readingBand: ReadingBand | null
  readingBandEstimated: boolean
  readingConfidence: 'low' | 'med' | 'high'
  currentCycle: number
  createdAt: string
}

/** Create/update responses carry non-blocking warnings (e.g. the nickname looks like a full name). */
export type ChildResponse = ChildDto & { warnings: string[] }

export const NICKNAME_WARNING_FULL_NAME = 'NICKNAME_LOOKS_LIKE_FULL_NAME'
