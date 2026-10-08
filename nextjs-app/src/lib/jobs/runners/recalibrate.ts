import { z } from 'zod'
import { CALIBRATION_DEFAULTS } from '@/lib/calibration/config'
import { recalibrate } from '@/lib/calibration/engine'
import type { EvidenceItem, ReadingState, SkillState, Trend } from '@/lib/calibration/types'
import {
  FALLBACK_ACTIVITIES,
  FALLBACK_RECOMMENDATIONS,
  buildSummary,
  explanationIsSafe,
  templateExplanation,
} from '@/lib/calibration/wording'
import { buildChildProfile, refreshChildProfileCache } from '@/lib/children/build-child-profile'
import { AppError } from '@/lib/errors/app-error'
import { callAgent } from '@/lib/foundry/client'
import type { ErrorType, ItemStatus } from '@/lib/grading/types'
import type { MasteryStatus, ReadingBand } from '@/lib/schemas/common'
import { uuid } from '@/lib/schemas/common'
import { getCatalog } from '@/lib/skills/catalog'
import { recordUsage } from '@/lib/usage/record'
import type { JobRunner } from '../context'

const inputSchema = z.object({ cycleId: uuid, childId: uuid, skipUnconfirmed: z.boolean().optional() }).passthrough()

interface GradedJoin {
  system_status: ItemStatus
  final_status: ItemStatus | null
  error_type: ErrorType | null
  method_sound: boolean | null
  needs_review: boolean
  parent_confirmed: boolean
  worksheet_items: ItemJoin | ItemJoin[] | null
}

interface ItemJoin {
  skill_id: string
  math_level: number
  reading_band: ReadingBand
  pair_id: string | null
  is_stretch: boolean
  is_reading_probe: boolean
  key_flagged_wrong: boolean
  verification: { pairRole?: 'low_reading' | 'target_reading' | null } | null
}

interface MasteryRow {
  skill_id: string
  math_level: number
  status: MasteryStatus
  evidence_count: number
  secure_cycles: number
  not_yet_cycles: number
  last_seen_cycle: number | null
  score_history: number[] | null
  trend: Trend
  manual_override: boolean
  retest: boolean
}

function defaultSkill(skillId: string, level: number): SkillState {
  return {
    skillId,
    mathLevel: level,
    status: 'not_enough_evidence',
    evidenceCount: 0,
    secureCycles: 0,
    notYetCycles: 0,
    lastSeenCycle: null,
    scoreHistory: [],
    trend: null,
    manualOverride: false,
    retest: false,
  }
}

/**
 * recalibrate: turns a graded, reviewed sheet into new skill levels and a new reading level.
 * All the rules run in code (src/lib/calibration/engine.ts). The model only words the explanation, and its
 * wording is discarded if it mentions any level the engine did not set. Everything is saved in one database
 * transaction, so a crash can never half-apply a result.
 */
export const runRecalibrate: JobRunner = async ({ job, service, setProgress, assertChildExists, log }) => {
  const input = inputSchema.parse(job.input)

  const { data: cycleRow, error: cycleError } = await service
    .from('cycles')
    .select('id, child_id, cycle_number, status, read_aloud, focus')
    .eq('id', input.cycleId)
    .maybeSingle()
  if (cycleError) throw new AppError('INTERNAL', { cause: cycleError })
  const cycle = cycleRow as {
    child_id: string
    cycle_number: number
    status: string
    read_aloud: boolean
    focus: { noAttribution?: boolean } | null
  } | null
  if (!cycle || cycle.child_id !== input.childId) throw new AppError('NOT_FOUND')
  if (cycle.status === 'complete') return { cycleId: input.cycleId, alreadyComplete: true }
  if (cycle.status !== 'graded') throw new AppError('CONFLICT', { message: 'This sheet hasn’t finished being checked.' })

  const { data: childRow, error: childError } = await service
    .from('children')
    .select(
      'id, user_id, nickname, reading_band, reading_band_estimated, reading_confidence, reading_up_streak, reading_down_streak, reading_evidence_cycles',
    )
    .eq('id', input.childId)
    .maybeSingle()
  if (childError) throw new AppError('INTERNAL', { cause: childError })
  const child = childRow as {
    user_id: string
    nickname: string
    reading_band: ReadingBand | null
    reading_band_estimated: boolean
    reading_confidence: 'low' | 'med' | 'high'
    reading_up_streak: number
    reading_down_streak: number
    reading_evidence_cycles: number
  } | null
  if (!child || child.user_id !== job.user_id) throw new AppError('NOT_FOUND')

  await setProgress('rules')

  // ---- Gather the evidence ----
  const { data: gradedRows, error: gradedError } = await service
    .from('graded_items')
    .select(
      'system_status, final_status, error_type, method_sound, needs_review, parent_confirmed, worksheet_items(skill_id, math_level, reading_band, pair_id, is_stretch, is_reading_probe, key_flagged_wrong, verification)',
    )
    .eq('cycle_id', input.cycleId)
  if (gradedError) throw new AppError('INTERNAL', { cause: gradedError })

  const items: EvidenceItem[] = []
  for (const row of (gradedRows ?? []) as unknown as GradedJoin[]) {
    const joined = Array.isArray(row.worksheet_items) ? row.worksheet_items[0] : row.worksheet_items
    if (!joined) continue
    const confirmed = row.parent_confirmed || !row.needs_review
    items.push({
      skillId: joined.skill_id,
      mathLevel: joined.math_level,
      readingBand: joined.reading_band,
      pairId: joined.pair_id,
      pairRole: joined.pair_id ? (joined.verification?.pairRole ?? null) : null,
      isStretch: joined.is_stretch,
      isReadingProbe: joined.is_reading_probe,
      // The parent's confirmed judgement wins over the system's.
      status: row.final_status ?? row.system_status,
      errorType: row.error_type,
      methodSound: row.method_sound,
      confirmed,
      keyFlaggedWrong: joined.key_flagged_wrong,
    })
  }

  const { data: masteryRows, error: masteryError } = await service
    .from('skill_mastery')
    .select('skill_id, math_level, status, evidence_count, secure_cycles, not_yet_cycles, last_seen_cycle, score_history, trend, manual_override, retest')
    .eq('child_id', input.childId)
  if (masteryError) throw new AppError('INTERNAL', { cause: masteryError })
  const mastery = new Map<string, SkillState>(
    ((masteryRows ?? []) as MasteryRow[]).map((row) => [
      row.skill_id,
      {
        skillId: row.skill_id,
        mathLevel: row.math_level,
        status: row.status,
        evidenceCount: row.evidence_count,
        secureCycles: row.secure_cycles,
        notYetCycles: row.not_yet_cycles,
        lastSeenCycle: row.last_seen_cycle,
        scoreHistory: row.score_history ?? [],
        trend: row.trend,
        manualOverride: row.manual_override,
        retest: row.retest,
      },
    ]),
  )
  // A skill that appears on the sheet but has no row yet starts at the level its questions were written at.
  for (const item of items) {
    if (!mastery.has(item.skillId) && !item.isStretch && !item.isReadingProbe) {
      mastery.set(item.skillId, defaultSkill(item.skillId, item.mathLevel))
    }
  }

  const catalog = await getCatalog()
  const skillNames = Object.fromEntries(catalog.map((skill) => [skill.skillId, skill.name]))
  const prerequisites = Object.fromEntries(catalog.map((skill) => [skill.skillId, skill.prerequisites]))

  const { data: lastReadingEvent } = await service
    .from('calibration_events')
    .select('cycle_id')
    .eq('child_id', input.childId)
    .eq('axis', 'reading')
    .eq('source', 'rules')
    .not('cycle_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  let readingCyclesSinceChange: number | null = null
  const changeCycleId = (lastReadingEvent as { cycle_id: string } | null)?.cycle_id
  if (changeCycleId) {
    const { data: changeCycle } = await service.from('cycles').select('cycle_number').eq('id', changeCycleId).maybeSingle()
    const changeNumber = (changeCycle as { cycle_number: number } | null)?.cycle_number
    if (changeNumber !== undefined) readingCyclesSinceChange = cycle.cycle_number - changeNumber
  }

  const { count: completedCount, error: completedError } = await service
    .from('cycles')
    .select('id', { count: 'exact', head: true })
    .eq('child_id', input.childId)
    .eq('status', 'complete')
  if (completedError) throw new AppError('INTERNAL', { cause: completedError })

  const readingBand: ReadingBand = child.reading_band ?? 'R2'
  const reading: ReadingState = {
    band: readingBand,
    estimated: child.reading_band_estimated,
    confidence: child.reading_confidence,
    upStreak: child.reading_up_streak,
    downStreak: child.reading_down_streak,
    evidenceCycles: child.reading_evidence_cycles,
  }

  // ---- The rules (no model involved) ----
  const states = Array.from(mastery.values())
  const result = recalibrate({
    cycleNumber: cycle.cycle_number,
    readAloud: cycle.read_aloud,
    attributeSkills: cycle.focus?.noAttribution !== true,
    items,
    mastery: states,
    reading,
    parentOverrides: states.filter((row) => row.manualOverride).map((row) => row.skillId),
    readingCyclesSinceChange,
    completedCycles: completedCount ?? 0,
    skillNames,
    prerequisites,
  })

  // ---- Wording (the model explains; it never decides) ----
  await assertChildExists()
  await setProgress('explaining')
  let calibrationText = templateExplanation(result.events)
  let recommendations = FALLBACK_RECOMMENDATIONS
  let activities = FALLBACK_ACTIVITIES
  try {
    const explained = await callAgent({
      mode: 'explain',
      input: {
        events: result.events.map((event) => ({
          axis: event.axis,
          skill_name: event.skillId ? (skillNames[event.skillId] ?? null) : null,
          from: event.fromLevel,
          to: event.toLevel,
          reason: event.reason,
        })),
        skill_results: result.skillResults.map((skill) => ({
          skill_name: skill.skillName,
          label: skill.label,
          evidence: skill.evidence,
        })),
        child_profile: await buildChildProfile(service, input.childId),
      },
      usage: { userId: job.user_id, childId: input.childId, jobId: job.id },
    })
    const text = [explained.data.text, ...explained.data.recommendations, ...explained.data.activities].join(' ')
    if (explanationIsSafe(text, result.events)) {
      calibrationText = explained.data.text
      if (explained.data.recommendations.length > 0) recommendations = explained.data.recommendations
      if (explained.data.activities.length > 0) activities = explained.data.activities
    } else {
      log.warn('explanation mentioned a level the engine did not set; using the plain template')
    }
  } catch (error) {
    // Wording is a nicety. The levels are already decided, so a model outage must not block saving them.
    log.warn({ err: error }, 'could not get a friendly explanation; using the plain template')
  }

  const counted = items.filter((item) => item.confirmed && !item.keyFlaggedWrong)
  const summary = buildSummary(
    child.nickname,
    {
      total: items.length,
      correct: counted.filter((item) => item.status === 'correct').length,
      partial: counted.filter((item) => item.status === 'partial').length,
      incorrect: counted.filter((item) => item.status === 'incorrect').length,
      blank: counted.filter((item) => item.status === 'blank').length,
      notCounted: items.length - counted.length,
    },
    result.skillResults,
  )

  // ---- Save everything in one transaction ----
  await setProgress('saving')
  const { error: applyError } = await service.rpc('apply_recalibration', {
    p_cycle_id: input.cycleId,
    p_child_id: input.childId,
    p_payload: {
      mastery: result.mastery.map((row) => ({
        skill_id: row.skillId,
        math_level: row.mathLevel,
        status: row.status,
        evidence_count: row.evidenceCount,
        secure_cycles: row.secureCycles,
        not_yet_cycles: row.notYetCycles,
        last_seen_cycle: row.lastSeenCycle,
        score_history: row.scoreHistory,
        trend: row.trend,
        manual_override: row.manualOverride,
        retest: row.retest,
      })),
      retest: result.retestSkillIds.map((skillId) => ({ skill_id: skillId, math_level: CALIBRATION_DEFAULTS.nonGapLevel })),
      reading: {
        band: result.reading.band,
        estimated: result.reading.estimated,
        confidence: result.reading.confidence,
        up_streak: result.reading.upStreak,
        down_streak: result.reading.downStreak,
        evidence_cycles: result.reading.evidenceCycles,
      },
      events: result.events.map((event) => ({
        axis: event.axis,
        skill_id: event.skillId,
        from_level: event.fromLevel,
        to_level: event.toLevel,
        reason: event.reason,
      })),
      cycle: {
        summary,
        calibration_text: calibrationText,
        // A snapshot of what the parent was shown, so the results page never has to recompute it.
        focus: {
          results: {
            skillResults: result.skillResults,
            readingReadout: result.readingReadout,
            flags: result.flags,
            recommendations,
            activities,
          },
        },
      },
    },
  })
  if (applyError) throw new AppError('INTERNAL', { cause: applyError })

  try {
    await refreshChildProfileCache(input.childId)
  } catch (cacheError) {
    log.warn({ err: cacheError }, 'could not refresh the cached child profile')
  }
  await recordUsage({ userId: job.user_id, childId: input.childId, jobId: job.id, event: 'cycle.complete' })
  return { cycleId: input.cycleId, events: result.events.length }
}
