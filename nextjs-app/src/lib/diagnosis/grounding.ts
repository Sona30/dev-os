import type { ConfirmedValues } from '@/lib/schemas/reports'
import type { DiagnoseOutput } from '@/lib/foundry/schemas/outputs'
import type { Skill } from '@/lib/skills/catalog'

// Keeps the diagnosis honest (FR-04, docs/specs/07 §4): data confidence is decided by code, every skill must
// exist in the catalogue and suit the child's grade, gaps are ordered by prerequisites, and nothing the model
// cannot ground is shown as fact. Pure functions — no I/O.

export type DataConfidence = 'high' | 'medium' | 'low'

export function dataConfidenceFor(values: ConfirmedValues): DataConfidence {
  const hasDomains = values.domainResults.some((domain) => domain.placement !== null || domain.score !== null)
  if (hasDomains) return 'high'
  if (values.placement !== null) return 'medium'
  return 'low'
}

export interface GroundedGap {
  domain: string
  skillId: string
  skillName: string
  evidence: string
  gapLevel: 'small' | 'moderate' | 'large'
  priority: number
  suggestedMathLevel: number
  likely: boolean
}

export interface GroundedStrength {
  skillId: string
  skillName: string
  note: string
}

export interface GroundedDiagnosis {
  gaps: GroundedGap[]
  strengths: GroundedStrength[]
  unmapped: string[]
}

const MAX_GAPS = 12
const GAP_RANK = { large: 0, moderate: 1, small: 2 } as const

/** Length of the longest prerequisite chain that stays inside the gap set (0 = no prerequisite is also a gap). */
function prerequisiteDepth(skillId: string, gapIds: Set<string>, catalog: Map<string, Skill>, seen = new Set<string>()): number {
  if (seen.has(skillId)) return 0 // guards against a malformed (cyclic) catalogue
  const skill = catalog.get(skillId)
  if (!skill) return 0
  const next = new Set(seen).add(skillId)
  let depth = 0
  for (const prerequisite of skill.prerequisites) {
    if (gapIds.has(prerequisite)) depth = Math.max(depth, 1 + prerequisiteDepth(prerequisite, gapIds, catalog, next))
  }
  return depth
}

/** Foundational skills first (they unlock the others), then larger gaps, then the model's own order. */
export function orderGaps<T extends { skillId: string; gapLevel: 'small' | 'moderate' | 'large' }>(
  gaps: T[],
  catalog: Map<string, Skill>,
): T[] {
  const gapIds = new Set(gaps.map((gap) => gap.skillId))
  return gaps
    .map((gap, index) => ({ gap, index, depth: prerequisiteDepth(gap.skillId, gapIds, catalog) }))
    .sort((a, b) => a.depth - b.depth || GAP_RANK[a.gap.gapLevel] - GAP_RANK[b.gap.gapLevel] || a.index - b.index)
    .map((entry) => entry.gap)
}

export function groundDiagnosis(
  output: DiagnoseOutput,
  context: { allowed: Skill[]; catalog: Map<string, Skill>; confidence: DataConfidence },
): GroundedDiagnosis {
  const allowedIds = new Set(context.allowed.map((skill) => skill.skillId))
  const unmapped = new Set(output.unmapped.map((text) => text.trim()).filter(Boolean))

  const seenGapSkills = new Set<string>()
  const accepted: Array<Omit<GroundedGap, 'priority'>> = []
  for (const gap of output.gaps) {
    const skill = gap.skillId ? context.catalog.get(gap.skillId) : undefined
    if (!gap.skillId || !skill || !allowedIds.has(gap.skillId)) {
      // Never show a skill we cannot ground; say that we could not match it (FR-04).
      unmapped.add(`${gap.domain}: ${gap.evidence}`)
      continue
    }
    if (seenGapSkills.has(gap.skillId)) continue
    seenGapSkills.add(gap.skillId)
    accepted.push({
      domain: skill.domain, // the catalogue is authoritative for names and domains
      skillId: skill.skillId,
      skillName: skill.name,
      evidence: gap.evidence,
      gapLevel: gap.gapLevel,
      suggestedMathLevel: gap.suggestedMathLevel,
      // Only a full domain-level report earns a firm (non-"likely") gap.
      likely: context.confidence === 'high' ? gap.likely : true,
    })
  }

  const gaps = orderGaps(accepted, context.catalog)
    .slice(0, MAX_GAPS)
    .map((gap, index) => ({ ...gap, priority: index + 1 }))

  const strengths: GroundedStrength[] = []
  const seenStrengths = new Set<string>()
  for (const strength of output.strengths) {
    const skill = context.catalog.get(strength.skillId)
    if (!skill || !allowedIds.has(skill.skillId) || seenStrengths.has(skill.skillId)) continue
    if (seenGapSkills.has(skill.skillId)) continue // a skill cannot be both a gap and a strength
    seenStrengths.add(skill.skillId)
    strengths.push({ skillId: skill.skillId, skillName: skill.name, note: strength.note })
  }

  return { gaps, strengths, unmapped: Array.from(unmapped) }
}
