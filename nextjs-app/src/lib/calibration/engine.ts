import { READING_BANDS } from '@/lib/constants'
import type { MasteryStatus, ReadingBand } from '@/lib/schemas/common'
import { CALIBRATION_CONFIG } from './config'
import type {
  CalibrationEvent,
  EngineInput,
  EngineOutput,
  EvidenceItem,
  ReadingReadout,
  ReadingState,
  SkillResult,
  SkillState,
  Trend,
} from './types'

// Mastery labels and two-axis recalibration (docs/specs/10-calibration-engine.md). A pure function:
// the same input always gives the same output. The model never decides a level; it only words the result.

const SCORE: Record<'secure' | 'developing' | 'not_yet', number> = { secure: 2, developing: 1, not_yet: 0 }
const MAX_LEVEL = 4
const MIN_LEVEL = 1

/** Only answers we can trust count: confirmed, key not disputed, and something was actually written. */
function isEligible(item: EvidenceItem): boolean {
  return item.confirmed && !item.keyFlaggedWrong && item.status !== 'blank'
}

export function trendFrom(history: number[]): Trend {
  if (history.length < 2) return null // a single sheet is noise
  const recent = history.slice(-3)
  const change = (recent[recent.length - 1] as number) - (recent[0] as number)
  return change > 0 ? 'improving' : change < 0 ? 'slipping' : 'steady'
}

interface SkillEvaluation {
  /** True when this sheet had any trusted question for the skill (so it belongs in the results). */
  touched: boolean
  state: SkillState
  result: SkillResult
  events: CalibrationEvent[]
  retest: string[]
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many
}

function evaluateSkill(prior: SkillState, items: EvidenceItem[], input: EngineInput): SkillEvaluation {
  const name = input.skillNames[prior.skillId] ?? prior.skillId
  const mine = items.filter((item) => item.skillId === prior.skillId && isEligible(item))

  // Math evidence: at the skill's current level, not reading probes, and not errors that point to reading or
  // attention rather than the maths.
  const evidenceItems = mine.filter(
    (item) =>
      !item.isReadingProbe &&
      item.mathLevel === prior.mathLevel &&
      !(item.status !== 'correct' && (item.errorType === 'reading_difficulty' || item.errorType === 'attention_copying')),
  )
  const evidence = evidenceItems.length
  const correct = evidenceItems.filter((item) => item.status === 'correct').length
  const correctSound = evidenceItems.filter((item) => item.status === 'correct' && item.methodSound !== false).length
  const incorrectConcept = evidenceItems.filter((item) => item.status === 'incorrect' && item.errorType === 'concept_gap').length

  // ---- Label (FR-12): one item is never enough ----
  let label: MasteryStatus
  if (evidence < CALIBRATION_CONFIG.minEvidenceForLabel) {
    const only = evidenceItems[0]
    const strongHistory = prior.status === 'secure' && prior.secureCycles >= 1
    label = evidence === 1 && only?.status === 'correct' && only.methodSound !== false && strongHistory ? 'secure' : 'not_enough_evidence'
  } else if (correctSound >= 2) {
    label = 'secure'
  } else if (incorrectConcept >= 2) {
    label = 'not_yet'
  } else {
    label = 'developing'
  }

  // Questions that do not move levels still tell the parent something.
  const stretch = mine.filter((item) => item.isStretch)
  let note: string | null = null
  if (stretch.length > 0) {
    note = stretch.some((item) => item.status === 'correct')
      ? 'Handled a harder question, so this skill may be ready for more.'
      : 'A harder question was a stretch, which is expected.'
  }

  const evidenceText =
    evidence === 0
      ? 'No questions at the current level yet.'
      : `${correct} of ${evidence} right${correctSound >= 1 && correctSound === correct ? ' with a clear method' : ''}${
          incorrectConcept >= 2 ? `, with the same stumbling point ${incorrectConcept} times` : ''
        }.`

  const base: SkillState = {
    ...prior,
    evidenceCount: prior.evidenceCount + evidence,
    lastSeenCycle: evidence >= 1 ? input.cycleNumber : prior.lastSeenCycle,
    retest: evidence >= 1 ? false : prior.retest,
  }

  // Not enough evidence: carry everything forward unchanged (the item is "re-tested" next time).
  if (label === 'not_enough_evidence') {
    return {
      touched: mine.length > 0,
      state: { ...base, manualOverride: false },
      result: { skillId: prior.skillId, skillName: name, label: prior.status === 'not_enough_evidence' ? label : prior.status, evidence: evidenceText, trend: prior.trend, levelChange: null, note },
      events: [],
      retest: [],
    }
  }

  const overridden = input.parentOverrides.includes(prior.skillId) || prior.manualOverride
  const moveUp = label === 'secure' && (correctSound >= 2 || prior.secureCycles >= 1)
  const moveDown = label === 'not_yet' && (prior.notYetCycles >= 1 || (correct === 0 && evidence >= 3))

  let level = prior.mathLevel
  const events: CalibrationEvent[] = []
  let retest: string[] = []
  let limitNote: string | null = null

  if (!overridden) {
    if (moveUp) {
      if (prior.mathLevel >= MAX_LEVEL) limitNote = 'Already at the highest level we practise.'
      else level = prior.mathLevel + CALIBRATION_CONFIG.maxLevelStep
    } else if (moveDown) {
      if (prior.mathLevel <= MIN_LEVEL) limitNote = 'Already at the earliest level we practise.'
      else {
        level = prior.mathLevel - CALIBRATION_CONFIG.maxLevelStep
        retest = input.prerequisites[prior.skillId] ?? []
      }
    }
  }

  if (level !== prior.mathLevel) {
    const up = level > prior.mathLevel
    events.push({
      axis: 'math',
      skillId: prior.skillId,
      fromLevel: `M${prior.mathLevel}`,
      toLevel: `M${level}`,
      reason: up
        ? `Got ${correctSound} of ${evidence} ${name} ${plural(evidence, 'question', 'questions')} right with a clear method, so ${name} moves up to level ${level}.`
        : `Missed ${incorrectConcept} of ${evidence} ${name} ${plural(evidence, 'question', 'questions')} in the same way, so the next worksheet adds a gentler step at level ${level}.`,
      source: 'rules',
    })
  }

  const levelChanged = level !== prior.mathLevel
  const scoreHistory = [...prior.scoreHistory, SCORE[label as 'secure' | 'developing' | 'not_yet']].slice(-CALIBRATION_CONFIG.scoreHistoryLength)
  const state: SkillState = {
    ...base,
    mathLevel: level,
    status: label,
    // Counters measure consecutive cycles at one level, so a level change (or a parent override) restarts them.
    secureCycles: levelChanged || overridden ? 0 : label === 'secure' ? prior.secureCycles + 1 : 0,
    notYetCycles: levelChanged || overridden ? 0 : label === 'not_yet' ? prior.notYetCycles + 1 : 0,
    scoreHistory,
    trend: trendFrom(scoreHistory),
    manualOverride: false,
  }

  return {
    touched: true,
    state,
    result: {
      skillId: prior.skillId,
      skillName: name,
      label,
      evidence: evidenceText,
      trend: state.trend,
      levelChange: levelChanged ? { from: prior.mathLevel, to: level } : null,
      note: limitNote ?? note,
    },
    events,
    retest,
  }
}

function bandIndex(band: ReadingBand): number {
  return READING_BANDS.indexOf(band)
}

interface ReadingEvaluation {
  state: ReadingState
  readout: ReadingReadout
  events: CalibrationEvent[]
}

/**
 * The reading axis moves only on evidence that points at reading: diagnostic pairs, reading probes, and
 * reading-difficulty errors. A maths-only mistake never touches it, and neither does a sheet the parent
 * read aloud (docs/specs/10 §5).
 */
function evaluateReading(input: EngineInput, skillLabels: Map<string, MasteryStatus>): ReadingEvaluation {
  const { reading } = input
  const unchanged = (verdict: ReadingReadout['verdict'], text: string): ReadingEvaluation => ({
    state: reading,
    readout: { verdict, text, pairsReadingLimited: 0, pairsReadingFine: 0, band: { from: reading.band, to: reading.band } },
    events: [],
  })

  if (input.readAloud) {
    return unchanged('not_enough_evidence', 'You read the questions aloud, so this sheet was not used to judge reading.')
  }

  const eligible = input.items.filter(isEligible)

  let limited = 0
  let fine = 0
  const pairs = new Map<string, EvidenceItem[]>()
  for (const item of eligible) if (item.pairId) pairs.set(item.pairId, [...(pairs.get(item.pairId) ?? []), item])
  const skillsCounted = new Set<string>()
  for (const members of Array.from(pairs.values())) {
    const low = members.find((item) => item.pairRole === 'low_reading')
    const target = members.find((item) => item.pairRole === 'target_reading')
    if (!low || !target) continue
    if (low.status === 'correct' && target.status !== 'correct') {
      limited++
      skillsCounted.add(target.skillId)
    } else if (low.status === 'correct' && target.status === 'correct') {
      fine++
    }
  }

  // Reading-difficulty errors on ordinary questions at the current band, for skills the child generally has.
  for (const item of eligible) {
    if (item.status === 'correct' || item.errorType !== 'reading_difficulty' || item.isReadingProbe) continue
    if (item.pairId || item.readingBand !== reading.band || skillsCounted.has(item.skillId)) continue
    const label = skillLabels.get(item.skillId)
    if (label === 'secure' || label === 'developing') {
      limited++
      skillsCounted.add(item.skillId)
    }
  }

  const probes = eligible.filter((item) => item.isReadingProbe)
  const probeCorrect = probes.filter((item) => item.status === 'correct').length
  const probeFailed = probes.filter((item) => item.status !== 'correct' && item.errorType === 'reading_difficulty').length

  if (limited === 0 && fine === 0 && probeCorrect === 0 && probeFailed === 0) {
    return unchanged('not_enough_evidence', 'Not enough reading evidence on this sheet to say whether wording helped or hindered.')
  }

  const upCandidate = probeCorrect >= 1 && probeFailed === 0 && limited === 0
  const downCandidate = limited >= 1 || probeFailed >= 1
  let upStreak = upCandidate ? reading.upStreak + 1 : 0
  let downStreak = downCandidate ? reading.downStreak + 1 : 0
  let band = reading.band
  const events: CalibrationEvent[] = []

  if (upStreak >= CALIBRATION_CONFIG.readingUpStreakNeeded && bandIndex(band) < READING_BANDS.length - 1) {
    band = READING_BANDS[bandIndex(band) + 1] as ReadingBand
    upStreak = 0
    downStreak = 0
    events.push({
      axis: 'reading',
      skillId: null,
      fromLevel: reading.band,
      toLevel: band,
      reason: `Harder wording went well on two sheets in a row, so the questions move up from reading level ${reading.band} to ${band}.`,
      source: 'rules',
    })
  } else if (downStreak >= CALIBRATION_CONFIG.readingDownStreakNeeded && bandIndex(band) > 0) {
    band = READING_BANDS[bandIndex(band) - 1] as ReadingBand
    upStreak = 0
    downStreak = 0
    events.push({
      axis: 'reading',
      skillId: null,
      fromLevel: reading.band,
      toLevel: band,
      reason: `The wording looked like the hard part on two sheets, so the questions ease from reading level ${reading.band} to ${band}.`,
      source: 'rules',
    })
  }

  const evidenceCycles = reading.evidenceCycles + 1
  const bandChanged = band !== reading.band
  let confidence = reading.confidence
  if (bandChanged) confidence = 'med'
  else if (
    evidenceCycles >= CALIBRATION_CONFIG.confidence.highAfterCycles &&
    (input.readingCyclesSinceChange === null ||
      input.readingCyclesSinceChange >= CALIBRATION_CONFIG.confidence.highNeedsCyclesSinceChange)
  ) {
    confidence = 'high'
  } else if (evidenceCycles >= CALIBRATION_CONFIG.confidence.medAfterCycles && confidence === 'low') {
    confidence = 'med'
  }

  const state: ReadingState = {
    band,
    // Once worksheets have calibrated the level it is no longer just a starting estimate.
    estimated: reading.estimated && confidence === 'low',
    confidence,
    upStreak,
    downStreak,
    evidenceCycles,
  }
  const verdict = downCandidate ? 'reading_may_be_limiting' : 'reading_looks_fine'
  return {
    state,
    events,
    readout: {
      verdict,
      text:
        verdict === 'reading_may_be_limiting'
          ? 'Some questions were missed in the usual wording but answered when the wording was easier, so reading may be part of the challenge.'
          : 'Reading looks comfortable at this level: the wording did not seem to get in the way.',
      pairsReadingLimited: limited,
      pairsReadingFine: fine,
      band: { from: reading.band, to: band },
    },
  }
}

export function recalibrate(input: EngineInput): EngineOutput {
  const noReading: ReadingReadout = {
    verdict: 'not_enough_evidence',
    text: 'We couldn’t match this sheet to its skills, so reading was not assessed.',
    pairsReadingLimited: 0,
    pairsReadingFine: 0,
    band: { from: input.reading.band, to: input.reading.band },
  }

  // Answers that cannot be tied to skills are shown to the parent but change nothing.
  if (!input.attributeSkills) {
    return {
      mastery: input.mastery,
      reading: input.reading,
      events: [],
      skillResults: [],
      readingReadout: noReading,
      retestSkillIds: [],
      flags: ['no_attribution'],
    }
  }

  const flags: string[] = []
  const known = new Set(input.mastery.map((row) => row.skillId))
  for (const item of input.items) {
    if (!known.has(item.skillId)) flags.push(`unknown_skill:${item.skillId}`)
  }

  const evaluations = input.mastery.map((row) => evaluateSkill(row, input.items, input))
  const events: CalibrationEvent[] = evaluations.flatMap((evaluation) => evaluation.events)
  const retestSkillIds = Array.from(new Set(evaluations.flatMap((evaluation) => evaluation.retest)))
  const labels = new Map(
    evaluations.map((evaluation) => [evaluation.state.skillId, evaluation.result.label] as [string, MasteryStatus]),
  )

  // Skills not practised for a while are re-tested (decay check).
  const mastery = evaluations.map((evaluation) => {
    const state = evaluation.state
    const sawEvidence = state.lastSeenCycle === input.cycleNumber
    const stale = state.lastSeenCycle !== null && input.cycleNumber - state.lastSeenCycle >= CALIBRATION_CONFIG.decayCycles
    if (!sawEvidence && stale && !state.retest) {
      flags.push(`retest:${state.skillId}`)
      return { ...state, retest: true }
    }
    return state
  })
  for (const skillId of retestSkillIds) flags.push(`retest:${skillId}`)

  const reading = evaluateReading(input, labels)
  events.push(...reading.events)

  const improving = mastery.some((row) => row.trend === 'improving' || row.status === 'secure')
  const hasHistory = mastery.some((row) => row.scoreHistory.length >= 3)
  if (input.completedCycles + 1 >= CALIBRATION_CONFIG.noImprovementCyclesForTeacherNudge && hasHistory && !improving) {
    flags.push('suggest_teacher_share')
  }

  return {
    mastery,
    reading: reading.state,
    events,
    skillResults: evaluations.filter((evaluation) => evaluation.touched).map((evaluation) => evaluation.result),
    readingReadout: reading.readout,
    retestSkillIds,
    flags,
  }
}
