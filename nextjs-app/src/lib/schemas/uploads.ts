import { z } from 'zod'
import { uuid } from './common'

// Wire schemas for docs/specs/03-uploads.md §3. Unsupported types and oversize files are checked in the
// service so they return 415 / 413 instead of a generic 400.

const MAX_FILES = { report_page: 5, completed_sheet: 4 } as const

export const signUploadsSchema = z
  .object({
    childId: uuid,
    kind: z.enum(['report_page', 'completed_sheet']),
    files: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(120),
            mime: z.string().min(1).max(100),
            bytes: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const max = MAX_FILES[value.kind]
    if (value.files.length > max) {
      context.addIssue({
        code: z.ZodIssueCode.too_big,
        type: 'array',
        maximum: max,
        inclusive: true,
        path: ['files'],
        message: `You can upload up to ${max} ${value.kind === 'report_page' ? 'report pages' : 'photos'} at a time`,
      })
    }
  })

export const completeUploadSchema = z
  .object({
    width: z.number().int().min(1).max(20000),
    height: z.number().int().min(1).max(20000),
  })
  .strict()

export const uploadIdParams = z.object({ uploadId: uuid })

export type SignUploadsInput = z.infer<typeof signUploadsSchema>
