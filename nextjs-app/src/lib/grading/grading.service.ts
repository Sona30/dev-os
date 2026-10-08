import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SIGNED_URL_TTL_SECONDS } from '@/lib/constants'
import { AppError } from '@/lib/errors/app-error'
import { enqueueJob } from '@/lib/jobs/enqueue'
import type { SubmitSheetInput } from '@/lib/schemas/grading'
import { createReadUrl, signedUrlsDisabled } from '@/lib/storage/signed-urls'
import { createServiceClient } from '@/lib/supabase/service'
import { recordUsage } from '@/lib/usage/record'
import { compareAnswer, confusionAlternatives, isBlank } from './compare'
import { settleStatus } from './routing'
import type { GradingStateDto, GradingSummary, ItemStatus, ReviewItemDto, ReviewQueueDto } from './types'

// Parent-facing grading operations: submit photos, work through flagged answers, finish the review.
// Reads use the user-scoped client (RLS). The only direct parent write is confirming an answer, which the
// database allows on a graded item's confirmation columns only (docs/specs/00 §9 R1).

interface CycleRow {
  id: string
  child_id: string
  cycle_number: number
  status: string
  read_aloud: boolean
  focus: { noAttribution?: boolean } | null
  summary: string | null
  calibration_text: string | null
}

const CYCLE_COLUMNS = 'id, child_id, cycle_number, status, read_aloud, focus, summary, calibration_text'

async function loadCycle(supabase: SupabaseClient, cycleId: string): Promise<CycleRow> {
  const { data, error } = await supabase.from('cycles').select(CYCLE_COLUMNS).eq('id', cycleId).maybeSingle()
  if (error) throw new AppError('INTERNAL', { cause: error })
  if (!data) throw new AppError('NOT_FOUND')
  return data as CycleRow
}

/** Photos of the completed sheet go to a background grading job. */
export async function submitSheet(
  supabase: SupabaseClient,
  userId: string,
  worksheetId: string,
  input: SubmitSheetInput,
): Promise<{ jobId: string }> {
  const { data: sheetRow, error: sheetError } = await supabase
    .from('worksheets')
    .select('id, cycle_id, child_id, is_current, verified_at')
    .eq('id', worksheetId)
    .maybeSingle()
  if (sheetError) throw new AppError('INTERNAL', { cause: sheetError })
  const sheet = sheetRow as { id: string; cycle_id: string; child_id: string; is_current: boolean; verified_at: string | null } | null
  if (!sheet || !sheet.verified_at) throw new AppError('NOT_FOUND')

  const cycle = await loadCycle(supabase, sheet.cycle_id)
  if (!sheet.is_current) throw new AppError('CONFLICT', { message: 'That worksheet has been replaced.' })
  if (['needs_review', 'graded', 'complete'].includes(cycle.status)) throw new AppError('ALREADY_GRADED')
  if (cycle.status !== 'ready') {
    throw new AppError('CONFLICT', { message: 'This worksheet isn’t ready for a photo yet.' })
  }

  const uploadIds = Array.from(new Set(input.uploadIds))
  const { data: uploadRows, error: uploadError } = await supabase
    .from('uploads')
    .select('id, child_id, kind, worksheet_id, confirmed_uploaded, deleted_at')
    .in('id', uploadIds)
  if (uploadError) throw new AppError('INTERNAL', { cause: uploadError })
  const uploads = (uploadRows ?? []) as Array<{
    child_id: string
    kind: string
    worksheet_id: string | null
    confirmed_uploaded: boolean
    deleted_at: string | null
  }>
  const usable =
    uploads.length === uploadIds.length &&
    uploads.every(
      (upload) =>
        upload.child_id === sheet.child_id &&
        upload.kind === 'completed_sheet' &&
        upload.confirmed_uploaded &&
        upload.deleted_at === null &&
        (upload.worksheet_id === null || upload.worksheet_id === worksheetId),
    )
  if (!usable) {
    throw new AppError('VALIDATION_ERROR', { message: 'Some of those photos aren’t ready. Please add them again.' })
  }

  const service = createServiceClient()
  // Claim the cycle atomically so a double click cannot submit twice.
  const { data: claimed, error: claimError } = await service
    .from('cycles')
    .update({ status: 'grading', read_aloud: input.readAloud })
    .eq('id', cycle.id)
    .eq('status', 'ready')
    .select('id')
    .maybeSingle()
  if (claimError) throw new AppError('INTERNAL', { cause: claimError })
  if (!claimed) throw new AppError('CONFLICT')

  try {
    const { jobId } = await enqueueJob({
      userId,
      childId: sheet.child_id,
      type: 'grade_sheet',
      input: {
        worksheetId,
        cycleId: cycle.id,
        childId: sheet.child_id,
        uploadIds,
        readAloud: input.readAloud,
        ...(input.confirmSheet !== undefined ? { confirmSheet: input.confirmSheet } : {}),
        ...(input.attributeSkills !== undefined ? { attributeSkills: input.attributeSkills } : {}),
      },
    })
    return { jobId }
  } catch (error) {
    await service.from('cycles').update({ status: 'ready' }).eq('id', cycle.id)
    throw error
  }
}

interface QueueRow {
  id: string
  extracted_answer: string | null
  extraction_confidence: number
  crop_path: string | null
  parent_confirmed: boolean
  worksheet_items: { position: number; question_text: string } | { position: number; question_text: string }[] | null
}

/** The answers we were unsure about, each with a picture of the handwriting. */
export async function getReviewQueue(supabase: SupabaseClient, cycleId: string): Promise<ReviewQueueDto> {
  await loadCycle(supabase, cycleId)

  const { data, error } = await supabase
    .from('graded_items')
    .select('id, extracted_answer, extraction_confidence, crop_path, parent_confirmed, worksheet_items(position, question_text)')
    .eq('cycle_id', cycleId)
    .eq('needs_review', true)
  if (error) throw new AppError('INTERNAL', { cause: error })
  const rows = (data ?? []) as unknown as QueueRow[]

  const pending = rows.filter((row) => !row.parent_confirmed)
  const service = createServiceClient()
  const items: ReviewItemDto[] = []
  for (const row of pending) {
    const item = Array.isArray(row.worksheet_items) ? row.worksheet_items[0] : row.worksheet_items
    let cropUrl: string | null = null
    if (row.crop_path) {
      // Without a picture the parent can still type what the child wrote, so a link failure is not fatal —
      // except when links are deliberately switched off, which the caller should hear about.
      if (signedUrlsDisabled()) throw new AppError('TEMPORARILY_UNAVAILABLE')
      cropUrl = await createReadUrl(service, 'uploads', row.crop_path, SIGNED_URL_TTL_SECONDS).catch(() => null)
    }
    items.push({
      gradedItemId: row.id,
      position: item?.position ?? 0,
      questionText: item?.question_text ?? '',
      cropUrl,
      extractedAnswer: row.extracted_answer,
      alternatives: confusionAlternatives(row.extracted_answer),
      confidence: row.extraction_confidence,
    })
  }
  items.sort((a, b) => a.position - b.position)
  return { total: rows.length, remaining: pending.length, items }
}

interface GradedRow {
  id: string
  cycle_id: string
  extracted_answer: string | null
  system_status: ItemStatus
  worksheet_items: { answer_type: 'integer' | 'text' | 'choice'; correct_answer: string; accepted_answers: string[] } | { answer_type: 'integer' | 'text' | 'choice'; correct_answer: string; accepted_answers: string[] }[] | null
}

/**
 * The parent confirms (or corrects) what the child wrote. Their answer wins; the system's original judgement
 * is kept untouched next to it. Only confirmed answers can ever influence the child's levels.
 */
export async function confirmGradedItem(
  supabase: SupabaseClient,
  userId: string,
  gradedItemId: string,
  input: { answer: string; status?: ItemStatus },
): Promise<{ gradedItemId: string; finalStatus: ItemStatus }> {
  const { data, error } = await supabase
    .from('graded_items')
    .select('id, cycle_id, extracted_answer, system_status, worksheet_items(answer_type, correct_answer, accepted_answers)')
    .eq('id', gradedItemId)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', { cause: error })
  if (!data) throw new AppError('NOT_FOUND')
  const row = data as unknown as GradedRow

  const cycle = await loadCycle(supabase, row.cycle_id)
  if (cycle.status !== 'needs_review' && cycle.status !== 'graded') throw new AppError('CONFLICT')

  const key = Array.isArray(row.worksheet_items) ? row.worksheet_items[0] : row.worksheet_items
  if (!key) throw new AppError('NOT_FOUND')

  // One tap on "Confirm" works because the right/wrong call is made here, not by the parent.
  let finalStatus: ItemStatus
  if (input.status) {
    finalStatus = input.status
  } else {
    const comparison = compareAnswer(input.answer, {
      answerType: key.answer_type,
      correctAnswer: key.correct_answer,
      acceptedAnswers: key.accepted_answers,
    })
    finalStatus = settleStatus({
      comparison: comparison.status,
      unitMissing: comparison.unitMissing,
      modelStatus: 'incorrect',
      modelErrorType: null,
      methodSound: null,
    })
  }

  const sameAnswer = (row.extracted_answer ?? '').trim().toLowerCase() === input.answer.trim().toLowerCase()
  const overridden = finalStatus !== row.system_status || !sameAnswer
  const { error: updateError } = await supabase
    .from('graded_items')
    .update({
      parent_confirmed: true,
      parent_answer: isBlank(input.answer) ? null : input.answer,
      final_status: finalStatus,
      overridden,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', gradedItemId)
  if (updateError) throw new AppError('INTERNAL', { cause: updateError })

  await recordUsage({ userId, childId: cycle.child_id, event: `override.item:${overridden ? 'yes' : 'no'}` })
  return { gradedItemId, finalStatus }
}

/**
 * The parent is finished reviewing. Unconfirmed answers either block this or, if the parent chooses, are
 * skipped: they stay unconfirmed and are never counted towards the child's levels (FR-10).
 * Then the recalibration job updates the levels. Safe to call again: the same job is returned while it runs.
 */
export async function finalizeReview(
  supabase: SupabaseClient,
  userId: string,
  cycleId: string,
  skipUnconfirmed: boolean,
): Promise<{ jobId: string; skipped: number }> {
  const cycle = await loadCycle(supabase, cycleId)
  if (cycle.status !== 'needs_review' && cycle.status !== 'graded') throw new AppError('CONFLICT')

  const { count, error } = await supabase
    .from('graded_items')
    .select('id', { count: 'exact', head: true })
    .eq('cycle_id', cycleId)
    .eq('needs_review', true)
    .eq('parent_confirmed', false)
  if (error) throw new AppError('INTERNAL', { cause: error })
  const remaining = count ?? 0
  if (remaining > 0 && !skipUnconfirmed) throw new AppError('REVIEW_PENDING')

  const { error: updateError } = await createServiceClient().from('cycles').update({ status: 'graded' }).eq('id', cycleId)
  if (updateError) throw new AppError('INTERNAL', { cause: updateError })

  const { jobId } = await enqueueJob({
    userId,
    childId: cycle.child_id,
    type: 'recalibrate',
    input: { cycleId, childId: cycle.child_id, skipUnconfirmed },
    dedupeKey: `recalibrate:${cycleId}`,
  })
  return { jobId, skipped: remaining }
}

interface SummaryRow {
  system_status: ItemStatus
  final_status: ItemStatus | null
  needs_review: boolean
  parent_confirmed: boolean
}

function summarise(rows: SummaryRow[]): GradingSummary {
  const summary: GradingSummary = { total: rows.length, gotIt: 0, stillBuilding: 0, blank: 0, needsCheck: 0 }
  for (const row of rows) {
    if (row.needs_review && !row.parent_confirmed) {
      summary.needsCheck++
      continue
    }
    const status = row.final_status ?? row.system_status
    if (status === 'correct') summary.gotIt++
    else if (status === 'blank') summary.blank++
    else summary.stillBuilding++
  }
  return summary
}

/** What the Results page needs: the open cycle, its worksheet, and a plain count of how it went. */
export async function getGradingState(supabase: SupabaseClient, childId: string): Promise<GradingStateDto> {
  const { data, error } = await supabase
    .from('cycles')
    .select(CYCLE_COLUMNS)
    .eq('child_id', childId)
    .order('cycle_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', { cause: error })
  const cycle = data as CycleRow | null
  if (!cycle) return { cycle: null, worksheet: null, summary: null }

  const { data: sheetRow, error: sheetError } = await supabase
    .from('worksheets')
    .select('id, sheet_id')
    .eq('cycle_id', cycle.id)
    .eq('is_current', true)
    .not('verified_at', 'is', null)
    .maybeSingle()
  if (sheetError) throw new AppError('INTERNAL', { cause: sheetError })
  const sheet = sheetRow as { id: string; sheet_id: string } | null

  let itemCount = 0
  if (sheet) {
    const { count } = await supabase
      .from('worksheet_items')
      .select('id', { count: 'exact', head: true })
      .eq('worksheet_id', sheet.id)
    itemCount = count ?? 0
  }

  const latestJob = async (type: string): Promise<string | null> => {
    const { data: job } = await supabase
      .from('jobs')
      .select('id')
      .eq('type', type)
      .contains('input', { cycleId: cycle.id })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return (job as { id: string } | null)?.id ?? null
  }

  let gradeJobId: string | null = null
  let recalibrateJobId: string | null = null
  let summary: GradingSummary | null = null
  if (cycle.status === 'grading') {
    gradeJobId = await latestJob('grade_sheet')
  } else if (['needs_review', 'graded', 'complete'].includes(cycle.status)) {
    const { data: graded, error: gradedError } = await supabase
      .from('graded_items')
      .select('system_status, final_status, needs_review, parent_confirmed')
      .eq('cycle_id', cycle.id)
    if (gradedError) throw new AppError('INTERNAL', { cause: gradedError })
    summary = summarise((graded ?? []) as SummaryRow[])
    if (cycle.status === 'graded') recalibrateJobId = await latestJob('recalibrate')
  }

  return {
    cycle: {
      id: cycle.id,
      number: cycle.cycle_number,
      status: cycle.status,
      readAloud: cycle.read_aloud,
      noAttribution: cycle.focus?.noAttribution === true,
      gradeJobId,
      recalibrateJobId,
      summaryText: cycle.summary,
      calibrationText: cycle.calibration_text,
    },
    worksheet: sheet ? { id: sheet.id, sheetId: sheet.sheet_id, itemCount } : null,
    summary,
  }
}
