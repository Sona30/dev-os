import { z } from 'zod'
import { childProfileSchema } from '@/lib/schemas/child-profile'
import { grade, nickname, readingBand, skillId } from '@/lib/schemas/common'

// The input contract (PRD s8): JSON in the user message. Required fields are enforced by the app before
// calling; the agent only flags anything surprising. Keys are snake_case on the wire to the model.

/** Test-only switch for the mock client to choose a fixture variant. Never set in production code. */
const fixture = { _fixture: z.string().optional() }

export const parseInput = z.object({ grade, child_nickname: nickname, ...fixture })

export const diagnoseInput = z.object({
  grade,
  score_or_placement: z.object({
    overall_score: z.number().nullable(),
    placement: z.string().nullable(),
    window: z.enum(['BOY', 'MOY', 'EOY']).nullable(),
    domains: z.array(z.object({ domain: z.string(), placement: z.string().nullable(), score: z.number().nullable() })),
  }),
  lexile: z.number().nullable(),
  /** The only skills the agent may cite (spec 07 grounding). */
  catalog: z.array(
    z.object({ skill_id: skillId, name: z.string(), domain: z.string(), prerequisites: z.array(skillId) }),
  ),
  child_profile: childProfileSchema,
  ...fixture,
})

export const generateInput = z.object({
  grade,
  /** The axis plan chosen by the planner: which skills, levels and reading bands, in order. */
  plan: z.object({ items: z.array(z.record(z.unknown())), bias: z.number().int().min(-1).max(1) }).passthrough(),
  history_summary: z.array(z.record(z.unknown())),
  band_constraints: z.record(z.unknown()),
  /** Positions and reasons when only some items are being re-requested after a failed check. */
  rework: z.array(z.object({ position: z.number().int(), reasons: z.array(z.string()) })).optional(),
  child_profile: childProfileSchema,
  ...fixture,
})

export const gradeInput = z.object({
  sheet_id: z.string(),
  /** The stored answer key for this exact sheet. The model compares against it; it never recalls one. */
  key: z.array(
    z.object({
      position: z.number().int(),
      question_text: z.string(),
      answer_type: z.enum(['integer', 'text', 'choice']),
      correct_answer: z.string(),
      accepted_answers: z.array(z.string()),
      skill_id: skillId,
      math_level: z.number().int(),
      reading_band: readingBand,
      pair_id: z.string().nullable(),
      pair_role: z.enum(['low_reading', 'target_reading']).nullable(),
    }),
  ),
  child_profile: childProfileSchema,
  ...fixture,
})

export const explainInput = z.object({
  events: z.array(
    z.object({
      axis: z.enum(['math', 'reading']),
      skill_name: z.string().nullable(),
      from: z.string(),
      to: z.string(),
      reason: z.string(),
    }),
  ),
  skill_results: z.array(z.object({ skill_name: z.string(), label: z.string(), evidence: z.string() })).optional(),
  child_profile: childProfileSchema.optional(),
  ...fixture,
})

export type ParseInput = z.infer<typeof parseInput>
export type DiagnoseInput = z.infer<typeof diagnoseInput>
export type GenerateInput = z.infer<typeof generateInput>
export type GradeInput = z.infer<typeof gradeInput>
export type ExplainInput = z.infer<typeof explainInput>
