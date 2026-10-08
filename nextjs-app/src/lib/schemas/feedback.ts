import { z } from 'zod'
import { uuid } from './common'

export const feedbackSchema = z
  .object({
    worksheetId: uuid,
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(500).optional(),
  })
  .strict()

export type FeedbackInput = z.infer<typeof feedbackSchema>
