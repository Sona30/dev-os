import { z } from 'zod'
import { paperSize, skillId, uuid } from './common'

// Wire schemas for worksheet endpoints (docs/specs/08-worksheet-generation.md §3).

export const startWorksheetSchema = z
  .object({
    diagnosisId: uuid,
    focusSkillIds: z.array(skillId).min(1).max(6).optional(),
    paperSize: paperSize.optional(),
  })
  .strict()

export const worksheetIdParams = z.object({ worksheetId: uuid })
export const cycleIdParams = z.object({ cycleId: uuid })
export const flagKeyParams = z.object({ worksheetId: uuid, itemId: uuid })

export const repaperSchema = z.object({ paperSize }).strict()
export const difficultySchema = z.object({ value: z.enum(['too_hard', 'too_easy']) }).strict()
export const readAloudSchema = z.object({ readAloud: z.boolean() }).strict()
export const flagKeySchema = z.object({ note: z.string().trim().max(300).optional() }).strict()

export type StartWorksheetInput = z.infer<typeof startWorksheetSchema>
