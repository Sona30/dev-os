import { z } from 'zod'
import { grade, nickname, uuid } from './common'

export const lexileField = z
  .number({ invalid_type_error: 'Enter a number from 0 to 1500' })
  .int('Enter a whole number')
  .min(0, 'Enter a number from 0 to 1500')
  .max(1500, 'Enter a number from 0 to 1500')

export const createChildSchema = z.object({ nickname, grade }).strict()

export const updateChildSchema = z
  .object({
    nickname: nickname.optional(),
    grade: grade.optional(),
    lexile: lexileField.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' })

export const deleteChildSchema = z.object({ confirm: z.string().min(1).max(60) }).strict()

export const childIdParams = z.object({ childId: uuid })

export type CreateChildInput = z.infer<typeof createChildSchema>
export type UpdateChildInput = z.infer<typeof updateChildSchema>
