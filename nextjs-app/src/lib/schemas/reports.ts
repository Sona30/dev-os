import { z } from 'zod'
import { lexileField } from './children'
import { uuid } from './common'

// Wire and storage schemas for report intake (docs/specs/06-report-parsing.md §2-3).

export const assessmentWindow = z.enum(['BOY', 'MOY', 'EOY'])
export type AssessmentWindow = z.infer<typeof assessmentWindow>

// 0-1000 mirrors the database check; real i-Ready scale scores sit well inside it.
export const scoreField = z
  .number({ invalid_type_error: 'Enter a number' })
  .int('Enter a whole number')
  .min(0, 'Enter a score from 0 to 1000')
  .max(1000, 'Enter a score from 0 to 1000')

export const placementText = z.string().trim().min(1, 'Choose a placement').max(80)

export const domainResultSchema = z
  .object({
    domain: z.string().trim().min(1).max(80),
    placement: placementText.nullable(),
    score: scoreField.nullable(),
  })
  .strict()

/** The values the parent has checked and approved (FR-01, FR-03). */
export const confirmedValuesSchema = z
  .object({
    window: assessmentWindow.nullable(),
    overallScore: scoreField.nullable(),
    placement: placementText.nullable(),
    domainResults: z.array(domainResultSchema).max(8),
    lexile: lexileField.nullable(),
  })
  .strict()
  .refine(
    (value) =>
      value.overallScore !== null ||
      value.placement !== null ||
      value.domainResults.some((domain) => domain.placement !== null || domain.score !== null),
    { message: 'Enter an overall score, a placement, or domain results', path: ['overallScore'] },
  )

export type ConfirmedValues = z.infer<typeof confirmedValuesSchema>

export const manualReportSchema = z
  .object({
    overallScore: scoreField.optional(),
    placement: placementText.optional(),
    window: assessmentWindow.optional(),
    lexile: lexileField.optional(),
  })
  .strict()
  .refine((value) => value.overallScore !== undefined || value.placement !== undefined, {
    message: 'Enter an overall score or choose a placement',
    path: ['placement'],
  })

export const createReportSchema = z.union([
  z.object({ uploadIds: z.array(uuid).min(1).max(5) }).strict(),
  z.object({ manual: manualReportSchema }).strict(),
])

export const confirmReportSchema = z.object({ values: confirmedValuesSchema }).strict()
export const diagnoseRequestSchema = z.object({ reportId: uuid }).strict()
export const reportIdParams = z.object({ reportId: uuid })
export const diagnosisIdParams = z.object({ diagnosisId: uuid })

export type ManualReportInput = z.infer<typeof manualReportSchema>
