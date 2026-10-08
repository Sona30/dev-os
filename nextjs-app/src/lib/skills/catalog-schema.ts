import { z } from 'zod'
import { grade, skillId } from '@/lib/schemas/common'

export const DOMAINS = [
  'Number & Operations',
  'Algebra & Algebraic Thinking',
  'Measurement & Data',
  'Geometry',
] as const

export const skillCatalogEntrySchema = z.object({
  skillId,
  grade,
  domain: z.enum(DOMAINS),
  name: z.string().min(1),
  prerequisites: z.array(skillId),
  levels: z.object({ M1: z.string(), M2: z.string(), M3: z.string(), M4: z.string() }),
})

export const skillCatalogSchema = z.array(skillCatalogEntrySchema).min(1)
export type SkillCatalogEntry = z.infer<typeof skillCatalogEntrySchema>
