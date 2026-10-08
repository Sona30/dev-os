import { recalibrate } from '@/lib/calibration/engine'
import type { EngineInput, EvidenceItem, ReadingState, SkillState } from '@/lib/calibration/types'
import type { ErrorType, ItemStatus } from '@/lib/grading/types'
import type { ReadingBand } from '@/lib/schemas/common'
import { measured, type SuiteOutput } from '../lib/report'
import { ratio, seededRandom } from '../lib/metrics'

// E11: synthetic 12-cycle profiles through the real calibration engine. Pure and free: no model, no database.
// Rules checked every cycle (PRD s5, FR-12/13, docs/specs/10):
//   R1 no skill moves more than one level, and levels stay between 1 and 4
//   R2 the reading band moves at most one step
//   R3 the reading band does not move on a cycle with no reading-attributable evidence
//   R4 answers the parent has not confirmed change nothing
//   R5 a sheet that could not be matched changes nothing

const BANDS: ReadingBand[] = ['R1', 'R2', 'R3', 'R4']
const SKILLS = ['G1.NO.01', 'G1.NO.02', 'G1.NO.03', 'G1.AL.01', 'G1.MD.01', 'G1.GE.01']
const PREREQUISITES: Record<string, string[]> = {
  'G1.NO.01': [],
  'G1.NO.02': ['G1.NO.01'],
  'G1.NO.03': ['G1.NO.02'],
  'G1.AL.01': ['G1.NO.02'],
  'G1.MD.01': [],
  'G1.GE.01': [],
}

const freshSkill = (skillId: string): SkillState => ({
  skillId,
  mathLevel: 2,
  status: 'not_enough_evidence',
  evidenceCount: 0,
  secureCycles: 0,
  notYetCycles: 0,
  lastSeenCycle: null,
  scoreHistory: [],
  trend: null,
  manualOverride: false,
  retest: false,
})

const bandIndex = (band: ReadingBand) => BANDS.indexOf(band)

function buildItems(random: () => number, mastery: SkillState[], band: ReadingBand, ability: number): EvidenceItem[] {
  const items: EvidenceItem[] = []
  const pick = (): SkillState => mastery[Math.floor(random() * mastery.length)] as SkillState
  const outcome = (): { status: ItemStatus; errorType: ErrorType | null } => {
    const roll = random()
    if (roll < ability) return { status: 'correct', errorType: null }
    if (roll < ability + 0.05) return { status: 'blank', errorType: null }
    const kinds: ErrorType[] = ['calculation_slip', 'concept_gap', 'reading_difficulty', 'attention_copying', 'unclear']
    return { status: 'incorrect', errorType: kinds[Math.floor(random() * kinds.length)] as ErrorType }
  }
  const make = (skill: SkillState, extra: Partial<EvidenceItem> = {}): EvidenceItem => {
    const result = outcome()
    return {
      skillId: skill.skillId,
      mathLevel: skill.mathLevel,
      readingBand: band,
      pairId: null,
      pairRole: null,
      isStretch: false,
      isReadingProbe: false,
      status: result.status,
      errorType: result.errorType,
      methodSound: result.status === 'correct' ? true : random() < 0.5,
      confirmed: random() < 0.9,
      keyFlaggedWrong: false,
      ...extra,
    }
  }
  for (let pair = 1; pair <= 2; pair++) {
    const skill = pick()
    items.push(make(skill, { pairId: `P${pair}`, pairRole: 'low_reading', readingBand: BANDS[Math.max(0, bandIndex(band) - 1)] as ReadingBand }))
    items.push(make(skill, { pairId: `P${pair}`, pairRole: 'target_reading' }))
  }
  items.push(make(pick(), { isReadingProbe: true, readingBand: BANDS[Math.min(3, bandIndex(band) + 1)] as ReadingBand }))
  items.push(make(pick(), { isStretch: true }))
  while (items.length < 10) items.push(make(pick()))
  return items
}

const hasReadingEvidence = (items: EvidenceItem[]) =>
  items.some((item) => item.confirmed && (item.pairId !== null || item.isReadingProbe || item.errorType === 'reading_difficulty'))

export function runE11(profiles = 20, cycles = 12): SuiteOutput {
  let checks = 0
  const failures: string[] = []
  const fail = (profile: number, cycle: number, rule: string) => {
    failures.push(`profile ${profile}, cycle ${cycle}: ${rule}`)
  }

  for (let profile = 1; profile <= profiles; profile++) {
    const random = seededRandom(profile * 7919)
    const ability = 0.3 + random() * 0.6
    let mastery = SKILLS.map(freshSkill)
    let reading: ReadingState = {
      band: BANDS[1 + Math.floor(random() * 2)] as ReadingBand,
      estimated: true,
      confidence: 'low',
      upStreak: 0,
      downStreak: 0,
      evidenceCycles: 0,
    }
    let sinceChange: number | null = null

    for (let cycle = 1; cycle <= cycles; cycle++) {
      const attributeSkills = random() > 0.05
      const items = buildItems(random, mastery, reading.band, ability)
      const input: EngineInput = {
        cycleNumber: cycle,
        readAloud: false,
        attributeSkills,
        items,
        mastery,
        reading,
        parentOverrides: [],
        readingCyclesSinceChange: sinceChange,
        completedCycles: cycle - 1,
        skillNames: Object.fromEntries(SKILLS.map((id) => [id, id])),
        prerequisites: PREREQUISITES,
      }
      const output = recalibrate(input)

      // R1
      for (const after of output.mastery) {
        const before = mastery.find((row) => row.skillId === after.skillId)
        checks++
        if (!before || Math.abs(after.mathLevel - before.mathLevel) > 1 || after.mathLevel < 1 || after.mathLevel > 4) {
          fail(profile, cycle, `R1 ${after.skillId} moved ${before?.mathLevel} -> ${after.mathLevel}`)
        }
      }
      // R2
      checks++
      if (Math.abs(bandIndex(output.reading.band) - bandIndex(reading.band)) > 1) {
        fail(profile, cycle, `R2 reading ${reading.band} -> ${output.reading.band}`)
      }
      // R3
      checks++
      if (!hasReadingEvidence(items) && output.reading.band !== reading.band) {
        fail(profile, cycle, `R3 reading moved ${reading.band} -> ${output.reading.band} with no reading evidence`)
      }
      // R4: the same cycle with the unconfirmed answers removed must give the same result.
      const withoutUnconfirmed = recalibrate({ ...input, items: items.filter((item) => item.confirmed) })
      checks++
      if (
        JSON.stringify(output.mastery.map((row) => [row.skillId, row.mathLevel, row.status])) !==
          JSON.stringify(withoutUnconfirmed.mastery.map((row) => [row.skillId, row.mathLevel, row.status])) ||
        output.reading.band !== withoutUnconfirmed.reading.band
      ) {
        fail(profile, cycle, 'R4 unconfirmed answers changed the result')
      }
      // R5
      if (!attributeSkills) {
        checks++
        if (JSON.stringify(output.mastery) !== JSON.stringify(mastery) || output.reading.band !== reading.band) {
          fail(profile, cycle, 'R5 an unmatched sheet changed levels')
        }
      }

      sinceChange = output.reading.band !== reading.band ? 0 : sinceChange === null ? null : sinceChange + 1
      mastery = output.mastery
      reading = output.reading
    }
  }

  return {
    metrics: [
      measured('E11', 'e11_rule_compliance', 'Recalibration rule compliance', ratio(checks - failures.length, checks), checks, {
        note: `${profiles} synthetic profiles × ${cycles} cycles`,
        failures,
      }),
    ],
  }
}
