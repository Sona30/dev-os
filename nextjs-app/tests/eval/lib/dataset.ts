import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { AgentImage } from '@/lib/foundry/types'

// Loads the labelled evaluation data from outside the repo (docs/specs/15 §3, tests/eval/DATASET_CARD.md).
// Layout: <EVAL_DATA_DIR>/{reports,sheets,adversarial}/<id>.json plus images named <id>.<ext> or <id>.<page>.<ext>.

export const dataDir = (): string => path.resolve(process.env.EVAL_DATA_DIR ?? 'eval-data')

const MIME: Record<string, AgentImage['mime']> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

const segments = z.record(z.string()).default({})

export const reportLabel = z.object({
  grade: z.union([z.literal(1), z.literal(2)]),
  window: z.enum(['BOY', 'MOY', 'EOY']).nullable().optional(),
  overallScore: z.number().int().nullable(),
  placement: z.string().nullable(),
  domains: z.array(z.object({ domain: z.string(), placement: z.string().nullable(), score: z.number().nullable().optional() })),
  segments,
})

export const sheetLabel = z.object({
  sheetId: z.string(),
  grade: z.union([z.literal(1), z.literal(2)]),
  key: z
    .array(
      z.object({
        position: z.number().int(),
        question_text: z.string(),
        answer_type: z.enum(['integer', 'text', 'choice']),
        correct_answer: z.string(),
        accepted_answers: z.array(z.string()).default([]),
        skill_id: z.string(),
        math_level: z.number().int(),
        reading_band: z.enum(['R1', 'R2', 'R3', 'R4']),
        pair_id: z.string().nullable().default(null),
        pair_role: z.enum(['low_reading', 'target_reading']).nullable().default(null),
      }),
    )
    .min(1),
  /** What the SME transcribed the child actually wrote ("" if blank), whether it is right, and the error type. */
  items: z.array(
    z.object({
      position: z.number().int(),
      written: z.string(),
      correct: z.boolean(),
      errorType: z.enum(['calculation_slip', 'concept_gap', 'reading_difficulty', 'attention_copying', 'unclear']).nullable().optional(),
    }),
  ),
  segments,
})

export const adversarialLabel = z.object({
  kind: z.string(),
  mode: z.enum(['parse', 'grade']),
  grade: z.union([z.literal(1), z.literal(2)]).default(1),
  /** reject: must be refused or not matched; accept: a valid input that must still work; blank: nothing may be invented. */
  expect: z.enum(['reject', 'accept', 'blank']),
  overallScore: z.number().int().nullable().optional(),
  sheetId: z.string().optional(),
  key: sheetLabel.shape.key.optional(),
})

export type ReportLabel = z.infer<typeof reportLabel>
export type SheetLabel = z.infer<typeof sheetLabel>
export type AdversarialLabel = z.infer<typeof adversarialLabel>

export interface Case<L> {
  id: string
  label: L
  images: AgentImage[]
}

async function imageFor(file: string): Promise<AgentImage | null> {
  const mime = MIME[path.extname(file).toLowerCase()]
  if (!mime) return null
  const bytes = await readFile(file)
  return { url: `data:${mime};base64,${bytes.toString('base64')}`, mime, label: path.basename(file) }
}

export async function loadCases<L>(subdir: string, schema: z.ZodType<L, z.ZodTypeDef, unknown>): Promise<Case<L>[]> {
  const dir = path.join(dataDir(), subdir)
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  const cases: Case<L>[] = []
  for (const name of names.filter((entry) => entry.endsWith('.json')).sort()) {
    const id = name.replace(/\.json$/, '')
    const parsed = schema.safeParse(JSON.parse(await readFile(path.join(dir, name), 'utf8')))
    if (!parsed.success) throw new Error(`${subdir}/${name} is not a valid label file: ${parsed.error.issues[0]?.message}`)
    const imageFiles = names.filter((entry) => entry.startsWith(`${id}.`) && !entry.endsWith('.json')).sort()
    const images: AgentImage[] = []
    for (const file of imageFiles) {
      const image = await imageFor(path.join(dir, file))
      if (image) images.push(image)
    }
    if (images.length === 0) throw new Error(`${subdir}/${id} has a label file but no image.`)
    cases.push({ id, label: parsed.data, images })
  }
  return cases
}
