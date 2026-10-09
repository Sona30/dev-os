import { z } from 'zod'
import { errorType, itemStatus, mathLevel, readingBand, skillId } from '@/lib/schemas/common'

// What the agent must return in each mode (docs/specs/05-foundry-integration.md §6).
// Every output is validated here before anything is stored; the model is never trusted blindly.

const confidence = z.number().min(0).max(1)

export const parseOutput = z.object({
  /** rejected_input: the upload is not an i-Ready Math report. */
  status: z.enum(['ok', 'rejected_input']),
  rejectReason: z.string().nullable(),
  window: z.enum(['BOY', 'MOY', 'EOY']).nullable(),
  overallScore: z.number().int().nullable(),
  placement: z.string().nullable(),
  domains: z.array(
    z.object({ domain: z.string(), placement: z.string().nullable(), score: z.number().nullable() }),
  ),
  confidence: z.object({
    window: confidence,
    overallScore: confidence,
    placement: confidence,
    domains: confidence,
  }),
  flags: z.array(z.string()),
})

export const diagnoseOutput = z.object({
  dataConfidence: z.enum(['high', 'medium', 'low']),
  summary: z.string().max(600),
  gaps: z
    .array(
      z.object({
        domain: z.string(),
        skillId: skillId.nullable(),
        skillName: z.string().nullable(),
        evidence: z.string(),
        gapLevel: z.enum(['small', 'moderate', 'large']),
        priority: z.number().int().min(1),
        suggestedMathLevel: mathLevel,
        likely: z.boolean(),
      }),
    )
    .max(12),
  strengths: z.array(z.object({ skillId, note: z.string() })).max(8),
  recommendations: z.array(z.string()).max(6),
  /** Things the agent could not map to a catalogue skill. */
  unmapped: z.array(z.string()),
  estimatedReadingBand: readingBand.nullable(),
  flags: z.array(z.string()),
})

export const generateOutput = z.object({
  items: z
    .array(
      z.object({
        position: z.number().int().min(1).max(10),
        skillId,
        domain: z.string(),
        mathLevel,
        readingBand,
        pairId: z.string().nullable(),
        isStretch: z.boolean(),
        isReadingProbe: z.boolean(),
        structure: z.string(),
        context: z.string(),
        numberSet: z.array(z.number()),
        questionText: z.string().max(600),
        answerType: z.enum(['integer', 'text', 'choice']),
        correctAnswer: z.string(),
        acceptedAnswers: z.array(z.string()),
        working: z.string(),
        verification: z.object({
          expression: z.string().nullable(),
          // The model sometimes writes the computed value as a number or boolean; the app recomputes the answer itself.
          expected: z.preprocess((value) => (value === null || value === undefined ? '' : String(value)), z.string()),
          passed: z.boolean(),
          method: z.enum(['code_interpreter', 'reasoned']),
        }),
        ambiguous: z.boolean(),
      }),
    )
    .min(1)
    .max(10),
  flags: z.array(z.string()),
})

export const gradeOutput = z.object({
  sheetId: z.string().nullable(),
  sheetIdConfidence: confidence,
  qualityAssessment: z.enum(['good', 'poor', 'unreadable']),
  items: z.array(
    z.object({
      position: z.number().int().min(1).max(10),
      extractedAnswer: z.string().nullable(),
      extractionConfidence: confidence,
      /** Normalised 0-1 coordinates on the page, used to crop the handwriting for review. */
      boundingBox: z
        .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number(), page: z.number().int().min(1) })
        .nullable(),
      status: itemStatus,
      errorType: errorType.nullable(),
      methodEvidence: z.string().max(300).nullable(),
      methodSound: z.boolean().nullable(),
    }),
  ),
  flags: z.array(z.string()),
})

export const explainOutput = z.object({
  text: z.string().max(500),
  recommendations: z.array(z.string()).max(4).default([]),
  activities: z.array(z.string()).max(3).default([]),
})

export type ParseOutput = z.infer<typeof parseOutput>
export type DiagnoseOutput = z.infer<typeof diagnoseOutput>
export type GenerateOutput = z.infer<typeof generateOutput>
export type GradeOutput = z.infer<typeof gradeOutput>
export type ExplainOutput = z.infer<typeof explainOutput>
