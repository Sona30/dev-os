import { z } from 'zod'
import { itemStatus, uuid } from './common'

// Wire schemas for photo grading and review (docs/specs/09-grading-and-review.md §3).

export const submitSheetSchema = z
  .object({
    uploadIds: z.array(uuid).min(1).max(4),
    readAloud: z.boolean(),
    /** After a Sheet ID mismatch: "yes, this photo is that worksheet". */
    confirmSheet: z.boolean().optional(),
    /** After a mismatch the parent may also choose to have answers scored without tying them to skills. */
    attributeSkills: z.boolean().optional(),
  })
  .strict()

export const confirmItemSchema = z
  .object({
    answer: z.string().trim().max(40),
    status: itemStatus.optional(),
  })
  .strict()

export const finalizeSchema = z.object({ skipUnconfirmed: z.boolean().optional() }).strict()
export const gradedItemParams = z.object({ gradedItemId: uuid })

export type SubmitSheetInput = z.infer<typeof submitSheetSchema>
