// Loads the skills catalogue into the skills_catalog table (docs/specs/07 §1.2).
//   npm run seed:catalog              → uses kb/skills_catalog.json (the SME-approved syllabus)
//   npm run seed:catalog -- --fixture → uses the DEVELOPMENT fixture; marked kb_version "dev-fixture",
//                                       which the app refuses to use when APP_ENV=production.
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const useFixture = process.argv.includes('--fixture')
const source = useFixture
  ? path.join(root, 'tests', 'fixtures', 'skills_catalog.dev.json')
  : path.join(root, 'kb', 'skills_catalog.json')

if (!existsSync(source)) {
  console.error(`${path.relative(root, source)} not found. Add the syllabus catalogue, or pass --fixture for development.`)
  process.exit(1)
}
for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[name]) {
    console.error(`Missing ${name}. Run with: node --env-file=.env.local scripts/seed-catalog.mjs`)
    process.exit(1)
  }
}

const skills = JSON.parse(readFileSync(source, 'utf8'))
const DOMAINS = ['Number & Operations', 'Algebra & Algebraic Thinking', 'Measurement & Data', 'Geometry']
const ids = new Set(skills.map((skill) => skill.skillId))

const problems = []
for (const skill of skills) {
  if (!/^G[12]\.[A-Z]{2,4}\.\d{2}$/.test(skill.skillId)) problems.push(`${skill.skillId}: bad id format`)
  if (![1, 2].includes(skill.grade)) problems.push(`${skill.skillId}: grade must be 1 or 2`)
  if (!DOMAINS.includes(skill.domain)) problems.push(`${skill.skillId}: unknown domain "${skill.domain}"`)
  for (const level of ['M1', 'M2', 'M3', 'M4']) if (!skill.levels?.[level]) problems.push(`${skill.skillId}: missing level ${level}`)
  for (const prerequisite of skill.prerequisites) if (!ids.has(prerequisite)) problems.push(`${skill.skillId}: unknown prerequisite ${prerequisite}`)
}

// Prerequisites must not form a cycle (Kahn's algorithm).
const remaining = new Map(skills.map((skill) => [skill.skillId, new Set(skill.prerequisites)]))
let progressed = true
while (remaining.size > 0 && progressed) {
  progressed = false
  for (const [id, prerequisites] of remaining) {
    if (prerequisites.size === 0) {
      remaining.delete(id)
      for (const other of remaining.values()) other.delete(id)
      progressed = true
    }
  }
}
if (remaining.size > 0) problems.push(`prerequisite cycle among: ${Array.from(remaining.keys()).join(', ')}`)

if (problems.length > 0) {
  console.error('Catalogue is not valid:\n - ' + problems.join('\n - '))
  process.exit(1)
}

const kbVersion = useFixture
  ? 'dev-fixture'
  : createHash('sha256').update(readFileSync(source)).digest('hex').slice(0, 12)

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const { error } = await supabase.from('skills_catalog').upsert(
  skills.map((skill) => ({
    skill_id: skill.skillId,
    grade: skill.grade,
    domain: skill.domain,
    name: skill.name,
    prerequisites: skill.prerequisites,
    levels: skill.levels,
    kb_version: kbVersion,
  })),
  { onConflict: 'skill_id' },
)
if (error) {
  console.error('Upsert failed:', error.message)
  process.exit(1)
}
console.log(`Loaded ${skills.length} skills (kb_version ${kbVersion}).`)
