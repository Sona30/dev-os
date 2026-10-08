import 'server-only'
import { AppError } from '@/lib/errors/app-error'
import type { Grade } from '@/lib/schemas/common'
import { createServiceClient } from '@/lib/supabase/service'
import type { DOMAINS } from './catalog-schema'

// Runtime access to the skills catalogue (docs/specs/07 §1.3). The catalogue is the only source of
// valid skill ids: anything the model cites is checked against it.

export interface Skill {
  skillId: string
  grade: Grade
  domain: (typeof DOMAINS)[number]
  name: string
  prerequisites: string[]
  levels: { M1: string; M2: string; M3: string; M4: string }
  kbVersion: string
}

export const DEV_FIXTURE_KB_VERSION = 'dev-fixture'
const CACHE_MS = 10 * 60 * 1000

let cache: { loadedAt: number; skills: Skill[] } | null = null

interface SkillRow {
  skill_id: string
  grade: Grade
  domain: Skill['domain']
  name: string
  prerequisites: string[]
  levels: Skill['levels']
  kb_version: string
}

export async function getCatalog(): Promise<Skill[]> {
  if (cache && Date.now() - cache.loadedAt < CACHE_MS) return cache.skills

  const { data, error } = await createServiceClient()
    .from('skills_catalog')
    .select('skill_id, grade, domain, name, prerequisites, levels, kb_version')
    .order('skill_id', { ascending: true })
  if (error) throw new AppError('INTERNAL', { cause: error })

  const skills = ((data ?? []) as SkillRow[]).map((row) => ({
    skillId: row.skill_id,
    grade: row.grade,
    domain: row.domain,
    name: row.name,
    prerequisites: row.prerequisites,
    levels: row.levels,
    kbVersion: row.kb_version,
  }))
  cache = { loadedAt: Date.now(), skills }
  return skills
}

/** Fails loudly if the catalogue is empty, or still the development fixture in production. */
export function assertCatalogUsable(skills: Skill[]): void {
  if (skills.length === 0) {
    throw new AppError('INTERNAL', {
      cause: new Error('skills_catalog is empty. Run `npm run seed:catalog` after the syllabus files are approved.'),
    })
  }
  if (process.env.APP_ENV === 'production' && skills.some((skill) => skill.kbVersion === DEV_FIXTURE_KB_VERSION)) {
    throw new AppError('INTERNAL', {
      cause: new Error('skills_catalog contains the development fixture; load the real syllabus before launch.'),
    })
  }
}

/** Skills a child may be given: their own grade, plus Grade 1 skills for a Grade 2 child (prerequisites, review). */
export function skillsForChild(skills: Skill[], grade: Grade): Skill[] {
  return skills.filter((skill) => skill.grade === grade || (grade === 2 && skill.grade === 1))
}

export function indexBySkillId(skills: Skill[]): Map<string, Skill> {
  return new Map(skills.map((skill) => [skill.skillId, skill]))
}
