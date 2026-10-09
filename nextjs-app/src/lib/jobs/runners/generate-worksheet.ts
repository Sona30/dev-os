import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CALIBRATION_DEFAULTS, clampLevel } from '@/lib/calibration/config'
import { buildChildProfile } from '@/lib/children/build-child-profile'
import { HISTORY_WINDOW_CYCLES, MAX_JOB_ATTEMPTS, MIN_ITEMS_PER_SHEET_FALLBACK } from '@/lib/constants'
import { consumeFreeCycle } from '@/lib/entitlements/entitlements.service'
import { AppError } from '@/lib/errors/app-error'
import { callAgent } from '@/lib/foundry/client'
import { getLogger } from '@/lib/logger'
import { deriveReadingBand } from '@/lib/reading/derive-reading-band'
import { paperSize, skillId, uuid } from '@/lib/schemas/common'
import { assertCatalogUsable, getCatalog, indexBySkillId, type Skill } from '@/lib/skills/catalog'
import { recordUsage } from '@/lib/usage/record'
import { BAND_RULES } from '@/lib/worksheets/bands'
import { buildPdfs, pdfPaths, type StoredItem } from '@/lib/worksheets/build-pdfs'
import { checkItem, emptyUsedKeys, keysOf, markUsed, type GeneratedItem } from '@/lib/worksheets/checks'
import { PlannerError, buildPlan } from '@/lib/worksheets/planner'
import { makeSheetId } from '@/lib/worksheets/sheet-id'
import type { AxisPlan, PlanItem, PlannerSkill } from '@/lib/worksheets/types'
import type { JobContext, JobRunner } from '../context'
import { isRetryableCode, toJobFailure } from '../errors'

const inputSchema = z
  .object({
    cycleId: uuid,
    childId: uuid,
    diagnosisId: uuid,
    focusSkillIds: z.array(skillId).min(1).max(6),
    paperSize,
    /** Set when regenerating: the worksheet this one replaces. */
    supersedes: uuid.optional(),
  })
  .passthrough()

const MAX_PASSES = 5
const HISTORY_ROWS_FOR_CHECKS = 300
const HISTORY_ROWS_FOR_MODEL = 40

interface DiagnosisGap {
  skillId: string
  domain: string
  suggestedMathLevel: number
}

interface MasteryRow {
  skill_id: string
  math_level: number
  status: PlannerSkill['status']
  retest: boolean
}

function verifyFailureMessage() {
  return 'We couldn’t verify all the answers, so we didn’t create a worksheet. Please try again.'
}

/** Records what became of the cycle when a generation attempt ends in a final failure. */
async function settleCycleOnFailure(ctx: JobContext, error: unknown): Promise<void> {
  const parsed = inputSchema.safeParse(ctx.job.input)
  if (!parsed.success) return
  const failure = toJobFailure(error)
  const terminal = !isRetryableCode(failure.code) || ctx.job.attempts >= MAX_JOB_ATTEMPTS
  if (!terminal) return

  const { cycleId, supersedes } = parsed.data
  // A failed regeneration puts the parent back on the worksheet they already have, and gives the retry back.
  const changes = supersedes ? { status: 'ready', regenerations_used: 0 } : { status: 'failed' }
  const { error: updateError } = await ctx.service.from('cycles').update(changes).eq('id', cycleId)
  if (updateError) ctx.log.error({ err: updateError }, 'could not settle the cycle after a failed generation')
}

export const runGenerateWorksheet: JobRunner = async (ctx) => {
  try {
    return await generate(ctx)
  } catch (error) {
    await settleCycleOnFailure(ctx, error)
    throw error
  }
}

async function generate(ctx: JobContext): Promise<Record<string, unknown>> {
  const { job, service, setProgress, assertChildExists, log } = ctx
  const input = inputSchema.parse(job.input)

  // ---- Load and verify ownership ----
  const { data: cycleRow, error: cycleError } = await service
    .from('cycles')
    .select('id, child_id, cycle_number')
    .eq('id', input.cycleId)
    .maybeSingle()
  if (cycleError) throw new AppError('INTERNAL', { cause: cycleError })
  const cycle = cycleRow as { id: string; child_id: string; cycle_number: number } | null
  if (!cycle || cycle.child_id !== input.childId) throw new AppError('NOT_FOUND')

  const { data: childRow, error: childError } = await service
    .from('children')
    .select('id, user_id, nickname, grade, lexile, reading_band, reading_up_streak')
    .eq('id', input.childId)
    .maybeSingle()
  if (childError) throw new AppError('INTERNAL', { cause: childError })
  const child = childRow as {
    user_id: string
    nickname: string
    grade: 1 | 2
    lexile: number | null
    reading_band: 'R1' | 'R2' | 'R3' | 'R4' | null
    reading_up_streak: number
  } | null
  if (!child || child.user_id !== job.user_id) throw new AppError('NOT_FOUND')

  // ---- Idempotency: never produce a second worksheet for the same request ----
  const { data: currentRow, error: currentError } = await service
    .from('worksheets')
    .select('id')
    .eq('cycle_id', cycle.id)
    .eq('is_current', true)
    .not('verified_at', 'is', null)
    .maybeSingle()
  if (currentError) throw new AppError('INTERNAL', { cause: currentError })
  const current = currentRow as { id: string } | null
  if (current && (!input.supersedes || current.id !== input.supersedes)) return { worksheetId: current.id }

  // Leftovers from an earlier attempt that died before finishing; their items and history cascade away.
  const { error: cleanupError } = await service.from('worksheets').delete().eq('cycle_id', cycle.id).is('verified_at', null)
  if (cleanupError) throw new AppError('INTERNAL', { cause: cleanupError })

  // ---- Plan (in code, before any model call) ----
  await setProgress('reading_profile')
  const catalog = await getCatalog()
  assertCatalogUsable(catalog)
  const catalogIndex = indexBySkillId(catalog)

  const { data: diagnosisRow, error: diagnosisError } = await service
    .from('diagnoses')
    .select('child_id, gaps, strengths')
    .eq('id', input.diagnosisId)
    .maybeSingle()
  if (diagnosisError) throw new AppError('INTERNAL', { cause: diagnosisError })
  const diagnosis = diagnosisRow as {
    child_id: string
    gaps: DiagnosisGap[]
    strengths: Array<{ skillId: string }>
  } | null
  if (!diagnosis || diagnosis.child_id !== input.childId) throw new AppError('NOT_FOUND')

  const { data: masteryRows, error: masteryError } = await service
    .from('skill_mastery')
    .select('skill_id, math_level, status, retest')
    .eq('child_id', input.childId)
  if (masteryError) throw new AppError('INTERNAL', { cause: masteryError })
  const mastery = new Map(((masteryRows ?? []) as MasteryRow[]).map((row) => [row.skill_id, row]))

  // The previous cycle tells us how the parent felt about difficulty and which levels just moved.
  const { data: previousRow, error: previousError } = await service
    .from('cycles')
    .select('id, parent_difficulty_feedback')
    .eq('child_id', input.childId)
    .lt('cycle_number', cycle.cycle_number)
    .order('cycle_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (previousError) throw new AppError('INTERNAL', { cause: previousError })
  const previous = previousRow as { id: string; parent_difficulty_feedback: 'too_hard' | 'too_easy' | null } | null
  const bias = previous?.parent_difficulty_feedback === 'too_hard' ? -1 : previous?.parent_difficulty_feedback === 'too_easy' ? 1 : 0

  const changedLastCycle = new Set<string>()
  if (previous) {
    const { data: events, error: eventsError } = await service
      .from('calibration_events')
      .select('skill_id')
      .eq('cycle_id', previous.id)
      .eq('axis', 'math')
      .eq('source', 'rules')
    if (eventsError) throw new AppError('INTERNAL', { cause: eventsError })
    for (const event of (events ?? []) as Array<{ skill_id: string | null }>) {
      if (event.skill_id) changedLastCycle.add(event.skill_id)
    }
  }

  const toPlannerSkill = (id: string, fallbackLevel: number, status: PlannerSkill['status']): PlannerSkill | null => {
    const skill = catalogIndex.get(id)
    if (!skill) return null
    const row = mastery.get(id)
    return {
      skillId: id,
      domain: skill.domain,
      mathLevel: row?.math_level ?? clampLevel(fallbackLevel),
      status: row?.status ?? status,
      changedLastCycle: changedLastCycle.has(id),
    }
  }

  const allGapIds = new Set(diagnosis.gaps.map((gap) => gap.skillId))
  const gaps = diagnosis.gaps
    .filter((gap) => input.focusSkillIds.includes(gap.skillId))
    .map((gap) => toPlannerSkill(gap.skillId, gap.suggestedMathLevel, 'not_enough_evidence'))
    .filter((skill): skill is PlannerSkill => skill !== null)

  const nearIds = new Set<string>()
  for (const row of Array.from(mastery.values())) {
    if (!allGapIds.has(row.skill_id) && row.status !== 'not_yet') nearIds.add(row.skill_id)
  }
  for (const strength of diagnosis.strengths) if (!allGapIds.has(strength.skillId)) nearIds.add(strength.skillId)
  const nearMastery = Array.from(nearIds)
    .map((id) => toPlannerSkill(id, CALIBRATION_DEFAULTS.strengthLevel, 'not_enough_evidence'))
    .filter((skill): skill is PlannerSkill => skill !== null)

  const retest = Array.from(mastery.values())
    .filter((row) => row.retest)
    .map((row) => toPlannerSkill(row.skill_id, row.math_level, row.status))
    .filter((skill): skill is PlannerSkill => skill !== null)

  const readingBand = child.reading_band ?? deriveReadingBand(child.grade, child.lexile).band
  let plan: AxisPlan
  try {
    plan = buildPlan({
      gaps,
      nearMastery,
      retest,
      readingBand,
      readingUpStreak: child.reading_up_streak,
      bias,
      cycleNumber: cycle.cycle_number,
    })
  } catch (error) {
    if (error instanceof PlannerError) throw new AppError('CONFLICT', { message: error.message })
    throw error
  }
  await setProgress('choosing_skills')

  // ---- Freshness: everything this child has seen in the last four cycles ----
  const { data: historyRows, error: historyError } = await service
    .from('question_history')
    .select('skill_id, structure, context, question_hash, number_set_key, context_structure_key')
    .eq('child_id', input.childId)
    .gte('cycle_number', cycle.cycle_number - HISTORY_WINDOW_CYCLES)
    .order('created_at', { ascending: false })
    .limit(HISTORY_ROWS_FOR_CHECKS)
  if (historyError) throw new AppError('INTERNAL', { cause: historyError })
  const history = (historyRows ?? []) as Array<{
    skill_id: string
    structure: string
    context: string
    question_hash: string
    number_set_key: string
    context_structure_key: string
  }>
  const used = emptyUsedKeys()
  for (const row of history) {
    used.hashes.add(row.question_hash)
    used.numberSets.add(row.number_set_key)
    used.contextStructures.add(row.context_structure_key)
  }
  const historySummary = history.slice(0, HISTORY_ROWS_FOR_MODEL).map((row) => ({
    skill_id: row.skill_id,
    structure: row.structure,
    context: row.context,
    number_set: row.number_set_key,
  }))

  // ---- Write, check, and rewrite what fails (at most three passes) ----
  const childProfile = await buildChildProfile(service, input.childId)
  const planByPosition = new Map(plan.items.map((item) => [item.position, item]))
  const accepted = new Map<number, GeneratedItem>()
  let rework: Array<{ position: number; reasons: string[] }> | undefined
  // The wording of each rejected item, shown back to the model so a rewrite edits it instead of repeating it.
  const rejectedText = new Map<number, string>()
  let modelName = ''
  let promptVersion = ''
  let kbVersion = ''

  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    await assertChildExists()
    await setProgress('writing_problems')
    const result = await callAgent({
      mode: 'generate',
      input: {
        grade: child.grade,
        plan: { items: plan.items as unknown as Array<Record<string, unknown>>, bias: plan.bias, cycleNumber: cycle.cycle_number },
        history_summary: historySummary,
        band_constraints: BAND_RULES as unknown as Record<string, unknown>,
        ...(rework ? { rework } : {}),
        child_profile: childProfile,
      },
      usage: { userId: job.user_id, childId: input.childId, jobId: job.id },
    })
    modelName = result.model
    promptVersion = result.promptVersion
    kbVersion = result.kbVersion

    await setProgress('verifying_answers')
    const wanted = new Set((rework ?? plan.items.map((item) => ({ position: item.position }))).map((entry) => entry.position))
    const reasonsByPosition = new Map<number, string[]>()
    for (const item of result.data.items) {
      const planItem = planByPosition.get(item.position)
      if (!planItem || !wanted.has(item.position) || accepted.has(item.position)) continue
      const reasons = checkItem(item, planItem, used)
      if (reasons.length === 0) {
        accepted.set(item.position, item)
        markUsed(used, item, false)
      } else {
        reasonsByPosition.set(item.position, reasons)
        rejectedText.set(item.position, item.questionText)
      }
    }

    const missing = plan.items.filter((item) => !accepted.has(item.position))
    if (missing.length === 0) break
    rework = missing.map((item) => {
      const reasons = reasonsByPosition.get(item.position) ?? ['No item was returned for this position.']
      const previous = rejectedText.get(item.position)
      return {
        position: item.position,
        reasons: previous
          ? [...reasons, `Your previous wording was: "${previous}". Edit it to fix the problems above; do not write it the same way again.`]
          : reasons,
      }
    })
    log.info({ pass, rejected: missing.length }, 'some generated items failed checks')
  }

  // ---- Decide what can be shipped. An unverified item is never shipped (FR-07). ----
  const kept = plan.items.filter((item) => accepted.has(item.position))
  if (kept.length < MIN_ITEMS_PER_SHEET_FALLBACK) {
    throw new AppError('AI_INVALID_OUTPUT', { message: verifyFailureMessage() })
  }
  if (kept.length < plan.items.length) {
    const domains = new Set(kept.map((item) => item.domain))
    const planned = new Set(plan.items.map((item) => item.pairId).filter((id): id is string => id !== null))
    const completePairs = Array.from(planned).filter(
      (pairId) => kept.filter((item) => item.pairId === pairId).length === 2,
    ).length
    if (domains.size < Math.min(3, plan.domains.length) || completePairs < Math.min(2, planned.size)) {
      throw new AppError('AI_INVALID_OUTPUT', { message: verifyFailureMessage() })
    }
  }

  // Renumber 1..n; a pair that lost one half is no longer a pair.
  const pairsKept = new Map<string, number>()
  for (const item of kept) if (item.pairId) pairsKept.set(item.pairId, (pairsKept.get(item.pairId) ?? 0) + 1)
  const finalItems = kept.map((planItem, index) => {
    const generated = accepted.get(planItem.position) as GeneratedItem
    const stillPaired = planItem.pairId !== null && pairsKept.get(planItem.pairId) === 2
    return { plan: planItem, generated, position: index + 1, pairId: stillPaired ? planItem.pairId : null }
  })

  // ---- Save ----
  const sheet = await saveWorksheet({
    ctx,
    input,
    cycleNumber: cycle.cycle_number,
    nickname: child.nickname,
    grade: child.grade,
    finalItems,
    catalog: catalogIndex,
    modelName,
    promptVersion,
    kbVersion,
  })

  // The free diagnostic is spent only now that a worksheet was delivered; the cycle becomes visible and ready.
  await consumeFreeCycle(job.user_id)
  const { error: readyError } = await service
    .from('cycles')
    .update({
      status: 'ready',
      focus: { focusSkillIds: input.focusSkillIds, paperSize: input.paperSize, diagnosisId: input.diagnosisId, bias },
    })
    .eq('id', cycle.id)
  if (readyError) throw new AppError('INTERNAL', { cause: readyError })

  await recordUsage({ userId: job.user_id, childId: input.childId, jobId: job.id, event: 'cycle.ready' })
  getLogger({ jobId: job.id }).info({ items: finalItems.length }, 'worksheet ready')
  return { worksheetId: sheet.id }
}

interface SaveParams {
  ctx: JobContext
  input: z.infer<typeof inputSchema>
  cycleNumber: number
  nickname: string
  grade: 1 | 2
  finalItems: Array<{ plan: PlanItem; generated: GeneratedItem; position: number; pairId: string | null }>
  catalog: Map<string, Skill>
  modelName: string
  promptVersion: string
  kbVersion: string
}

async function saveWorksheet(params: SaveParams): Promise<{ id: string; sheetId: string }> {
  const { ctx, input, cycleNumber, finalItems, catalog } = params
  const { job, service, setProgress } = ctx

  const { data: versionRow, error: versionError } = await service
    .from('worksheets')
    .select('version')
    .eq('cycle_id', input.cycleId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (versionError) throw new AppError('INTERNAL', { cause: versionError })
  const version = ((versionRow as { version: number } | null)?.version ?? 0) + 1

  // Insert the worksheet invisible (not current, not verified); it only becomes visible at the very end.
  let worksheet: { id: string; sheet_id: string } | null = null
  for (let attempt = 0; attempt < 5 && !worksheet; attempt++) {
    const sheetId = makeSheetId(params.nickname, cycleNumber)
    const { data, error } = await service
      .from('worksheets')
      .insert({
        cycle_id: input.cycleId,
        child_id: input.childId,
        sheet_id: sheetId,
        version,
        is_current: false,
        paper_size: input.paperSize,
        prompt_version: params.promptVersion,
        model: params.modelName,
        kb_version: params.kbVersion,
      })
      .select('id, sheet_id')
      .single()
    if (error && error.code === '23505') continue // sheet id collision: draw another suffix
    if (error) throw new AppError('INTERNAL', { cause: error })
    worksheet = data as { id: string; sheet_id: string }
  }
  if (!worksheet) throw new AppError('INTERNAL', { cause: new Error('could not allocate a unique sheet id') })
  const worksheetId = worksheet.id
  const sheetCode = worksheet.sheet_id

  const itemRows = finalItems.map(({ plan, generated, position, pairId }) => ({
    worksheet_id: worksheetId,
    position,
    skill_id: plan.skillId,
    domain: catalog.get(plan.skillId)?.domain ?? plan.domain,
    math_level: plan.mathLevel,
    reading_band: plan.readingBand,
    pair_id: pairId,
    is_stretch: plan.role === 'stretch',
    is_reading_probe: plan.role === 'reading_probe',
    structure: generated.structure,
    context: generated.context,
    number_set: generated.numberSet,
    question_text: generated.questionText,
    answer_type: generated.answerType,
    correct_answer: generated.correctAnswer,
    accepted_answers: generated.acceptedAnswers,
    working: generated.working,
    // Generation metadata kept with the check evidence: the pair role and the item's role are used by grading and the key.
    verification: { ...generated.verification, pairRole: pairId ? plan.pairRole : null, role: plan.role },
    question_hash: keysOf(generated).hash,
  }))
  const { error: itemsError } = await service.from('worksheet_items').insert(itemRows)
  if (itemsError) throw new AppError('INTERNAL', { cause: itemsError })

  const historyRows = finalItems.map(({ plan, generated }) => {
    const keys = keysOf(generated)
    return {
      child_id: input.childId,
      worksheet_id: worksheetId,
      cycle_number: cycleNumber,
      skill_id: plan.skillId,
      structure: generated.structure,
      context: generated.context,
      number_set: generated.numberSet,
      question_hash: keys.hash,
      context_structure_key: keys.contextStructure,
      number_set_key: keys.numberSet,
    }
  })
  const { error: historyInsertError } = await service.from('question_history').insert(historyRows)
  if (historyInsertError) throw new AppError('INTERNAL', { cause: historyInsertError })

  // ---- PDFs ----
  await setProgress('building_pdf')
  const stored: StoredItem[] = itemRows.map((row) => ({
    position: row.position,
    skill_id: row.skill_id,
    math_level: row.math_level,
    reading_band: row.reading_band,
    pair_id: row.pair_id,
    is_stretch: row.is_stretch,
    is_reading_probe: row.is_reading_probe,
    question_text: row.question_text,
    correct_answer: row.correct_answer,
    accepted_answers: row.accepted_answers,
    working: row.working,
    verification: { pairRole: row.verification.pairRole, role: row.verification.role },
  }))
  const pdfs = await buildPdfs(
    { nickname: params.nickname, grade: params.grade, cycleNumber, sheetId: sheetCode, paper: input.paperSize },
    stored,
    catalog,
  )
  const paths = pdfPaths(job.user_id, input.childId, sheetCode)
  await uploadPdf(service, paths.student, pdfs.student)
  await uploadPdf(service, paths.key, pdfs.key)

  // ---- Make it visible: retire the old worksheet (regeneration), then verify and activate this one ----
  if (input.supersedes) {
    const { error } = await service
      .from('worksheets')
      .update({ is_current: false, superseded_by: worksheetId })
      .eq('id', input.supersedes)
    if (error) throw new AppError('INTERNAL', { cause: error })
  }
  const { error: activateError } = await service
    .from('worksheets')
    .update({
      is_current: true,
      verified_at: new Date().toISOString(), // set only now that every item passed every check
      student_pdf_path: paths.student,
      key_pdf_path: paths.key,
    })
    .eq('id', worksheetId)
  if (activateError) throw new AppError('INTERNAL', { cause: activateError })

  return { id: worksheetId, sheetId: sheetCode }
}

export async function uploadPdf(service: SupabaseClient, path: string, bytes: Uint8Array): Promise<void> {
  const { error } = await service.storage.from('worksheets').upload(path, bytes, {
    contentType: 'application/pdf',
    upsert: true,
  })
  if (error) throw new AppError('INTERNAL', { cause: error })
}

