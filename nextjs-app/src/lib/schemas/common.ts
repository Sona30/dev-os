import { z } from 'zod'

// Shared zod primitives — docs/specs/00-overview-and-conventions.md §7.
// Used by both route handlers and forms so client and server validate identically.

export const uuid = z.string().uuid()
export const grade = z.union([z.literal(1), z.literal(2)])
export const readingBand = z.enum(['R1', 'R2', 'R3', 'R4'])
export const mathLevel = z.number().int().min(1).max(4)
export const skillId = z.string().regex(/^G[12]\.[A-Z]{2,4}\.\d{2}$/)
export const itemStatus = z.enum(['correct', 'partial', 'incorrect', 'blank'])
export const errorType = z.enum([
  'calculation_slip',
  'concept_gap',
  'reading_difficulty',
  'attention_copying',
  'unclear',
])
export const masteryStatus = z.enum(['secure', 'developing', 'not_yet', 'not_enough_evidence'])
export const paperSize = z.enum(['letter', 'a4'])
export const nickname = z
  .string()
  .trim()
  .min(1, 'Please enter a first name or nickname')
  .max(30, 'Please use 30 characters or fewer')
  .regex(/^[\p{L}\p{N} '\-.]+$/u, 'Use letters, numbers, spaces, apostrophes, hyphens or periods')

export const apiError = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
})

export type Grade = z.infer<typeof grade>
export type ReadingBand = z.infer<typeof readingBand>
export type MasteryStatus = z.infer<typeof masteryStatus>
