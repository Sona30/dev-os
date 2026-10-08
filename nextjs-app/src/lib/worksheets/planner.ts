import { READING_BANDS } from '@/lib/constants'
import type { ReadingBand } from '@/lib/schemas/common'
import { nameHint } from './names'
import type { AxisPlan, PairRole, PlanItem, PlannerSkill, PlanRole } from './types'

// Decides, in code and before any model call, what the worksheet must contain (docs/specs/08 §4.1).
// The model only fills in wording; it cannot change skills, levels or reading bands. Deterministic: the same
// input always gives the same plan.

export interface PlannerInput {
  /** Focus gap skills, most important first. At least one. */
  gaps: PlannerSkill[]
  /** Skills the child already has, used for confidence-building and stretch items. */
  nearMastery: PlannerSkill[]
  /** Skills flagged for re-testing (decay or a lowered prerequisite). */
  retest: PlannerSkill[]
  readingBand: ReadingBand
  /** Consecutive cycles of reading-probe success; two means the band is about to rise, so no more probes. */
  readingUpStreak: number
  /** From the previous cycle's "too hard / too easy": -1 easier, +1 harder, 0 unchanged. */
  bias: -1 | 0 | 1
  cycleNumber: number
}

export class PlannerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlannerError'
  }
}

export const SHEET_SIZE = 10
const PAIR_COUNT = 2
const DEFAULT_SKILL_CAP = 3
const RELAXED_SKILL_CAP = 5
const DOMAIN_CAP = 5

// Item mix by bias (FR-05): about 60-70% gap items, 20-30% near-mastery, 1-2 review/stretch/probe items.
const MIX = {
  [-1]: { gap: 5, near: 4, flex: 1 },
  0: { gap: 6, near: 2, flex: 2 },
  1: { gap: 7, near: 1, flex: 2 },
} as const

function bandIndex(band: ReadingBand): number {
  return READING_BANDS.indexOf(band)
}

function lowerBand(band: ReadingBand): ReadingBand {
  return READING_BANDS[Math.max(0, bandIndex(band) - 1)] ?? band
}

function higherBand(band: ReadingBand): ReadingBand {
  return READING_BANDS[Math.min(READING_BANDS.length - 1, bandIndex(band) + 1)] ?? band
}

type Draft = Omit<PlanItem, 'position' | 'nameHint'>

function draft(skill: PlannerSkill, role: PlanRole, band: ReadingBand, mathLevel = skill.mathLevel): Draft {
  return {
    skillId: skill.skillId,
    domain: skill.domain,
    mathLevel,
    readingBand: band,
    role,
    pairId: null,
    pairRole: null,
    minimalReading: false,
  }
}

/** First gap skill, then the first gap in a different domain (so pairs add domain variety), else the second. */
function pickPairSkills(gaps: PlannerSkill[]): PlannerSkill[] {
  const first = gaps[0]
  if (!first) return []
  const other = gaps.find((skill) => skill.skillId !== first.skillId && skill.domain !== first.domain) ?? gaps[1] ?? first
  return [first, other]
}

export function buildPlan(input: PlannerInput): AxisPlan {
  if (input.gaps.length === 0) {
    throw new PlannerError('There are no skills to practise yet. Run the gap analysis first.')
  }
  const { readingBand: band, bias } = input
  const mix = MIX[bias]
  const items: Draft[] = []
  const countBySkill = new Map<string, number>()
  const countByDomain = new Map<string, number>()
  const add = (item: Draft) => {
    items.push(item)
    countBySkill.set(item.skillId, (countBySkill.get(item.skillId) ?? 0) + 1)
    countByDomain.set(item.domain, (countByDomain.get(item.domain) ?? 0) + 1)
  }

  // ---- 1. Flex items: one reading probe, then re-tests, then stretch (never when the child found it too hard) ----
  let flexLeft = mix.flex
  const usedForFlex = new Set<string>()
  const secureCandidates = input.nearMastery.filter((skill) => skill.status === 'secure' && !skill.changedLastCycle)

  if (bias !== -1 && band !== 'R4' && input.readingUpStreak < 2 && flexLeft > 0) {
    const candidate = secureCandidates[0]
    if (candidate) {
      // Raises the reading axis only; the math level stays where it is.
      add(draft(candidate, 'reading_probe', higherBand(band)))
      usedForFlex.add(candidate.skillId)
      flexLeft--
    }
  }
  for (const skill of input.retest) {
    if (flexLeft === 0) break
    if (usedForFlex.has(skill.skillId)) continue
    add(draft(skill, 'review', band))
    usedForFlex.add(skill.skillId)
    flexLeft--
  }
  if (bias !== -1) {
    for (const skill of secureCandidates) {
      if (flexLeft === 0) break
      if (usedForFlex.has(skill.skillId)) continue
      // Raises the math axis only; reading stays at the child's band.
      add(draft(skill, 'stretch', band, skill.mathLevel >= 4 ? 3 : skill.mathLevel + 1))
      usedForFlex.add(skill.skillId)
      flexLeft--
    }
  }

  // ---- 2. Near-mastery (confidence) items: unfilled flex slots become more of these ----
  const nearTarget = mix.near + flexLeft
  const nearPool = input.nearMastery.filter((skill) => !input.gaps.some((gap) => gap.skillId === skill.skillId))
  const gapDomains = new Set(input.gaps.map((gap) => gap.domain))
  // Prefer skills from domains the gap items will not already cover.
  const orderedNear = [
    ...nearPool.filter((skill) => !gapDomains.has(skill.domain)),
    ...nearPool.filter((skill) => gapDomains.has(skill.domain)),
  ]
  const nearCapacity = (skill: PlannerSkill) => 2 + (usedForFlex.has(skill.skillId) ? 1 : 0)
  for (let i = 0; i < nearTarget; i++) {
    // Rotate through the skills the child already has, taking the next one with room.
    const skill = orderedNear
      .map((_, offset) => orderedNear[(i + offset) % orderedNear.length] as PlannerSkill)
      .find((candidate) => (countBySkill.get(candidate.skillId) ?? 0) < nearCapacity(candidate))
    if (skill) {
      add(draft(skill, 'near_mastery', band))
      continue
    }
    // Nothing suitable: ease off a gap skill by one level so the child still gets an early win.
    const gap = input.gaps[i % input.gaps.length] as PlannerSkill
    add(draft(gap, 'near_mastery', band, Math.max(1, gap.mathLevel - 1)))
  }

  // ---- 3. Gap items: two diagnostic pairs first, then one per uncovered domain, then by priority ----
  const gapTarget = SHEET_SIZE - items.length
  const pairSkills = pickPairSkills(input.gaps)
  for (let pair = 0; pair < PAIR_COUNT && items.length < SHEET_SIZE - 1; pair++) {
    const skill = pairSkills[pair % pairSkills.length] as PlannerSkill
    const pairId = `P${pair + 1}`
    const low: Draft = {
      ...draft(skill, 'gap', lowerBand(band)),
      pairId,
      pairRole: 'low_reading' as PairRole,
      minimalReading: band === 'R1',
    }
    const target: Draft = { ...draft(skill, 'gap', band), pairId, pairRole: 'target_reading' as PairRole }
    add(low)
    add(target)
  }

  const gapItemsPlaced = () => items.filter((item) => item.role === 'gap').length
  const canAdd = (skill: PlannerSkill, cap: number) =>
    (countBySkill.get(skill.skillId) ?? 0) < cap && (countByDomain.get(skill.domain) ?? 0) < DOMAIN_CAP

  // One item for every gap domain not yet represented, so the sheet spans the domains in the gap plan.
  for (const skill of input.gaps) {
    if (gapItemsPlaced() >= gapTarget) break
    if (!items.some((item) => item.domain === skill.domain) && canAdd(skill, DEFAULT_SKILL_CAP)) {
      add(draft(skill, 'gap', band))
    }
  }

  // Then spread the rest by priority, relaxing the per-skill cap only when there are too few skills.
  for (const cap of [DEFAULT_SKILL_CAP, RELAXED_SKILL_CAP]) {
    let progressed = true
    while (items.length < SHEET_SIZE && gapItemsPlaced() < gapTarget && progressed) {
      progressed = false
      for (const skill of input.gaps) {
        if (items.length >= SHEET_SIZE || gapItemsPlaced() >= gapTarget) break
        if (canAdd(skill, cap)) {
          add(draft(skill, 'gap', band))
          progressed = true
        }
      }
    }
  }
  // Last resort (very few skills): top up with gap items ignoring the caps.
  while (items.length < SHEET_SIZE) {
    add(draft(input.gaps[items.length % input.gaps.length] as PlannerSkill, 'gap', band))
  }

  // ---- 4. Order: an easy confidence opener, then ascending difficulty, stretch and probe last ----
  const opener = items
    .filter((item) => item.role === 'near_mastery')
    .reduce<Draft | null>((easiest, item) => (!easiest || item.mathLevel < easiest.mathLevel ? item : easiest), null)
  const rest = items.filter((item) => item !== opener)
  const group = (item: Draft) => (item.role === 'reading_probe' ? 3 : item.role === 'stretch' ? 2 : 1)
  const sorted = rest
    .map((item, index) => ({ item, index }))
    .sort((a, b) => group(a.item) - group(b.item) || a.item.mathLevel - b.item.mathLevel || a.index - b.index)
    .map((entry) => entry.item)
  const ordered = opener ? [opener, ...sorted] : sorted

  const plan: AxisPlan = {
    items: ordered.map((item, index) => ({
      ...item,
      position: index + 1,
      nameHint: nameHint(input.cycleNumber, index + 1),
    })),
    domains: Array.from(new Set(ordered.map((item) => item.domain))),
    bias,
  }
  assertAxisRule(plan, input)
  return plan
}

/**
 * Safety net for FR-06: no item may raise both axes at once, and every pair is two items for one skill at
 * one math level. Throws PlannerError if broken, which would indicate a bug in the planner.
 */
export function assertAxisRule(plan: AxisPlan, input: Pick<PlannerInput, 'readingBand'>): void {
  for (const item of plan.items) {
    const raisesMath = item.role === 'stretch'
    const raisesReading = bandIndex(item.readingBand) > bandIndex(input.readingBand)
    if (raisesMath && raisesReading) {
      throw new PlannerError(`Item ${item.position} raises both math level and reading band.`)
    }
  }
  const pairs = new Map<string, PlanItem[]>()
  for (const item of plan.items) {
    if (item.pairId) pairs.set(item.pairId, [...(pairs.get(item.pairId) ?? []), item])
  }
  for (const [pairId, members] of Array.from(pairs.entries())) {
    const [a, b] = members
    if (members.length !== 2 || !a || !b || a.skillId !== b.skillId || a.mathLevel !== b.mathLevel) {
      throw new PlannerError(`Pair ${pairId} must be two items for the same skill at the same math level.`)
    }
  }
}
