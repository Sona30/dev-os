import { z } from 'zod'
import { grade, masteryStatus, mathLevel, nickname, readingBand, skillId } from './common'

// The Child Profile sent with every agent call (FR-14) — docs/specs/00-overview-and-conventions.md §7.
export const childProfileSchema = z.object({
  child: z.object({ nickname, grade }),
  baseline: z.object({
    overallScore: z.number().nullable(),
    placement: z.string().nullable(),
    window: z.enum(['BOY', 'MOY', 'EOY']).nullable(),
    reportDate: z.string().nullable(),
  }),
  reading: z.object({
    lexile: z.number().nullable(),
    band: readingBand.nullable(),
    estimated: z.boolean(),
    confidence: z.enum(['low', 'med', 'high']),
  }),
  skills: z.array(
    z.object({
      skillId,
      mathLevel,
      status: masteryStatus,
      evidenceCount: z.number(),
      lastSeenCycle: z.number().nullable(),
      trend: z.enum(['improving', 'steady', 'slipping']).nullable(),
    }),
  ),
  cycles: z
    .array(
      z.object({
        cycle: z.number(),
        sheetId: z.string(),
        resultsSummary: z.string(),
        calibrationChanges: z.array(z.string()),
      }),
    )
    .max(4),
  flags: z.array(z.string()),
})

export type ChildProfile = z.infer<typeof childProfileSchema>
