import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireChild } from '@/lib/children/children.service'
import { SIGNED_URL_TTL_SECONDS, MAX_REGENERATIONS_PER_CYCLE } from '@/lib/constants'
import { assertCanStartCycle } from '@/lib/entitlements/entitlements.service'
import { AppError } from '@/lib/errors/app-error'
import { enqueueJob } from '@/lib/jobs/enqueue'
import { createReadUrl } from '@/lib/storage/signed-urls'
import { createServiceClient } from '@/lib/supabase/service'
import { recordUsage } from '@/lib/usage/record'
import type { StartWorksheetInput } from '@/lib/schemas/worksheets'
import type { StudentItemDto, WorksheetDetailDto, WorksheetDto, WorksheetStateDto } from './types'

// Parent-facing worksheet operations. Reads go through the user-scoped client (RLS); derived data is written
// with the service role only after ownership is proven (docs/specs/00 §9 R1).

const OPEN_CYCLE_STATUSES = ['generating', 'ready', 'grading', 'needs_review', 'graded']
const MAX_FOCUS_SKILLS = 6

interface CycleRow {
  id: string
  child_id: string
  cycle_number: number
  status: string
  diagnosis_id: string | null
  regenerations_used: number
  parent_difficulty_feedback: 'too_hard' | 'too_easy' | null
  read_aloud: boolean
  focus: { focusSkillIds?: string[]; paperSize?: 'letter' | 'a4' } | null
}

interface WorksheetRow {
  id: string
  cycle_id: string
  child_id: string
  sheet_id: string
  version: number
  paper_size: 'letter' | 'a4'
  is_current: boolean
  verified_at: string | null
  student_pdf_path: string | null
  key_pdf_path: string | null
  created_at: string
}

const CYCLE_COLUMNS =
  'id, child_id, cycle_number, status, diagnosis_id, regenerations_used, parent_difficulty_feedback, read_aloud, focus'
const SHEET_COLUMNS =
  'id, cycle_id, child_id, sheet_id, version, paper_size, is_current, verified_at, student_pdf_path, key_pdf_path, created_at'

async function loadCycle(supabase: SupabaseClient, cycleId: string): Promise<CycleRow> {
  const { data, error } = await supabase.from('cycles').select(CYCLE_COLUMNS).eq('id', cycleId).maybeSingle()
  if (error) throw new AppError('INTERNAL', { cause: error })
  if (!data) throw new AppError('NOT_FOUND')
  return data as CycleRow
}

/** A worksheet the parent may see: verified, and (for actions) the current one. */
async function loadWorksheet(supabase: SupabaseClient, worksheetId: string): Promise<WorksheetRow> {
  const { data, error } = await supabase.from('worksheets').select(SHEET_COLUMNS).eq('id', worksheetId).maybeSingle()
  if (error) throw new AppError('INTERNAL', { cause: error })
  const row = data as WorksheetRow | null
  // A worksheet that is not yet verified does not exist as far as parents are concerned (FR-07).
  if (!row || !row.verified_at) throw new AppError('NOT_FOUND')
  return row
}

async function latestJobId(supabase: SupabaseClient, type: string, key: string, value: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('jobs')
    .select('id')
    .eq('type', type)
    .contains('input', { [key]: value })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', { cause: error })
  return (data as { id: string } | null)?.id ?? null
}

async function signedUrl(path: string | null): Promise<string> {
  if (!path) throw new AppError('NOT_FOUND')
  return createReadUrl(createServiceClient(), 'worksheets', path, SIGNED_URL_TTL_SECONDS)
}

function toWorksheetDto(row: WorksheetRow, cycleNumber: number, itemCount: number, domainCount: number): WorksheetDto {
  return {
    id: row.id,
    sheetId: row.sheet_id,
    cycleId: row.cycle_id,
    childId: row.child_id,
    cycleNumber,
    paperSize: row.paper_size,
    version: row.version,
    verifiedAt: row.verified_at as string,
    createdAt: row.created_at,
    itemCount,
    domainCount,
  }
}

/**
 * The child's copy as data (question text only — never answers, skills or levels) plus fresh download links.
 * Answers live only in the parent PDF.
 */
export async function getWorksheetDetail(supabase: SupabaseClient, worksheetId: string): Promise<WorksheetDetailDto> {
  const sheet = await loadWorksheet(supabase, worksheetId)
  const cycle = await loadCycle(supabase, sheet.cycle_id)

  const { data, error } = await supabase
    .from('worksheet_items')
    .select('id, position, question_text, answer_type, domain')
    .eq('worksheet_id', worksheetId)
    .order('position', { ascending: true })
  if (error) throw new AppError('INTERNAL', { cause: error })
  const rows = (data ?? []) as Array<{
    id: string
    position: number
    question_text: string
    answer_type: StudentItemDto['answerType']
    domain: string
  }>

  const items: StudentItemDto[] = rows.map((row) => ({
    id: row.id,
    position: row.position,
    questionText: row.question_text,
    answerType: row.answer_type,
  }))

  return {
    worksheet: toWorksheetDto(sheet, cycle.cycle_number, rows.length, new Set(rows.map((row) => row.domain)).size),
    items,
    studentPdfUrl: await signedUrl(sheet.student_pdf_path),
    keyPdfUrl: await signedUrl(sheet.key_pdf_path),
    expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
    regenerationsUsed: cycle.regenerations_used,
    difficultyFeedback: cycle.parent_difficulty_feedback,
    readAloud: cycle.read_aloud,
    cycleStatus: cycle.status,
  }
}

/** What the Gap analysis page should show: nothing yet, a worksheet being written, or the worksheet itself. */
export async function getWorksheetState(supabase: SupabaseClient, childId: string): Promise<WorksheetStateDto> {
  const { data, error } = await supabase
    .from('cycles')
    .select(CYCLE_COLUMNS)
    .eq('child_id', childId)
    .order('cycle_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', { cause: error })
  const cycle = data as CycleRow | null
  if (!cycle) return { cycle: null, detail: null }

  const generateJobId =
    cycle.status === 'generating' || cycle.status === 'failed'
      ? await latestJobId(supabase, 'generate_worksheet', 'cycleId', cycle.id)
      : null

  const { data: sheetRow, error: sheetError } = await supabase
    .from('worksheets')
    .select('id')
    .eq('cycle_id', cycle.id)
    .eq('is_current', true)
    .not('verified_at', 'is', null)
    .maybeSingle()
  if (sheetError) throw new AppError('INTERNAL', { cause: sheetError })

  const detail =
    sheetRow && cycle.status !== 'failed' ? await getWorksheetDetail(supabase, (sheetRow as { id: string }).id) : null
  return {
    cycle: { id: cycle.id, number: cycle.cycle_number, status: cycle.status, generateJobId },
    detail,
  }
}

/**
 * Starts a new cycle: checks the plan allows it (before any model call), reserves the cycle, queues the job.
 */
export async function startWorksheet(
  supabase: SupabaseClient,
  userId: string,
  childId: string,
  input: StartWorksheetInput,
): Promise<{ jobId: string; cycleId: string }> {
  const child = await requireChild(supabase, childId)

  const { data: diagnosisRow, error: diagnosisError } = await supabase
    .from('diagnoses')
    .select('id, child_id, gaps')
    .eq('id', input.diagnosisId)
    .maybeSingle()
  if (diagnosisError) throw new AppError('INTERNAL', { cause: diagnosisError })
  const diagnosis = diagnosisRow as { child_id: string; gaps: Array<{ skillId: string }> } | null
  if (!diagnosis || diagnosis.child_id !== child.id) throw new AppError('NOT_FOUND')

  const { data: openRows, error: openError } = await supabase
    .from('cycles')
    .select('id')
    .eq('child_id', child.id)
    .in('status', OPEN_CYCLE_STATUSES)
    .limit(1)
  if (openError) throw new AppError('INTERNAL', { cause: openError })
  if ((openRows ?? []).length > 0) {
    throw new AppError('CONFLICT', { message: 'There is already a worksheet in progress for this child.' })
  }

  try {
    await assertCanStartCycle(supabase, userId, child.id)
  } catch (error) {
    // How often families reach the paywall is a key product signal.
    if (error instanceof AppError && error.code === 'PAYWALL') {
      await recordUsage({ userId, childId: child.id, event: 'paywall.hit' })
    }
    throw error
  }

  const gapIds = diagnosis.gaps.map((gap) => gap.skillId)
  const focusSkillIds = input.focusSkillIds ?? gapIds.slice(0, MAX_FOCUS_SKILLS)
  if (focusSkillIds.length === 0) {
    throw new AppError('CONFLICT', { message: 'There are no skills to practise yet.' })
  }
  if (!focusSkillIds.every((id) => gapIds.includes(id))) {
    throw new AppError('VALIDATION_ERROR', { message: 'Choose skills from the gap analysis.' })
  }

  let paper = input.paperSize
  if (!paper) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('paper_size')
      .eq('id', userId)
      .maybeSingle()
    if (profileError) throw new AppError('INTERNAL', { cause: profileError })
    paper = (profile as { paper_size: 'letter' | 'a4' } | null)?.paper_size ?? 'letter'
  }

  const service = createServiceClient()
  const { data: cycleData, error: cycleError } = await service.rpc('allocate_cycle', {
    p_child_id: child.id,
    p_diagnosis_id: input.diagnosisId,
  })
  if (cycleError) throw new AppError('INTERNAL', { cause: cycleError })
  const cycleId = (cycleData as { id: string }).id

  try {
    const { error: focusError } = await service
      .from('cycles')
      .update({ focus: { focusSkillIds, paperSize: paper } })
      .eq('id', cycleId)
    if (focusError) throw new AppError('INTERNAL', { cause: focusError })

    const { jobId } = await enqueueJob({
      userId,
      childId: child.id,
      type: 'generate_worksheet',
      input: { cycleId, childId: child.id, diagnosisId: input.diagnosisId, focusSkillIds, paperSize: paper },
    })
    await recordUsage({ userId, childId: child.id, event: 'cycle.started' })
    return { jobId, cycleId }
  } catch (error) {
    // Never leave a reserved cycle behind that would block the next attempt.
    await service.from('cycles').update({ status: 'failed' }).eq('id', cycleId)
    throw error
  }
}

/** One regeneration per cycle (FR-20). The current worksheet stays available until the new one is verified. */
export async function regenerateWorksheet(
  supabase: SupabaseClient,
  userId: string,
  worksheetId: string,
): Promise<{ jobId: string }> {
  const sheet = await loadWorksheet(supabase, worksheetId)
  const cycle = await loadCycle(supabase, sheet.cycle_id)
  if (!sheet.is_current || cycle.status !== 'ready') {
    throw new AppError('CONFLICT', { message: 'This worksheet can no longer be regenerated.' })
  }
  if (cycle.regenerations_used >= MAX_REGENERATIONS_PER_CYCLE) throw new AppError('REGEN_LIMIT')
  if (!cycle.diagnosis_id || !cycle.focus?.focusSkillIds?.length) {
    throw new AppError('CONFLICT', { message: 'This worksheet can’t be regenerated.' })
  }

  const service = createServiceClient()
  // The conditions make the count and the status change atomic, so a double click cannot regenerate twice.
  const { data: claimed, error: claimError } = await service
    .from('cycles')
    .update({ regenerations_used: cycle.regenerations_used + 1, status: 'generating' })
    .eq('id', cycle.id)
    .eq('status', 'ready')
    .eq('regenerations_used', cycle.regenerations_used)
    .select('id')
    .maybeSingle()
  if (claimError) throw new AppError('INTERNAL', { cause: claimError })
  if (!claimed) throw new AppError('REGEN_LIMIT')

  try {
    return await enqueueJob({
      userId,
      childId: sheet.child_id,
      type: 'generate_worksheet',
      input: {
        cycleId: cycle.id,
        childId: sheet.child_id,
        diagnosisId: cycle.diagnosis_id,
        focusSkillIds: cycle.focus.focusSkillIds,
        paperSize: sheet.paper_size,
        supersedes: sheet.id,
      },
    }).then(({ jobId }) => ({ jobId }))
  } catch (error) {
    await service.from('cycles').update({ status: 'ready', regenerations_used: cycle.regenerations_used }).eq('id', cycle.id)
    throw error
  }
}

/** Switch between Letter and A4: same questions, new PDFs. Returns null when nothing needs to change. */
export async function repaperWorksheet(
  supabase: SupabaseClient,
  userId: string,
  worksheetId: string,
  paper: 'letter' | 'a4',
): Promise<{ jobId: string } | null> {
  const sheet = await loadWorksheet(supabase, worksheetId)
  if (sheet.paper_size === paper) return null
  const { jobId } = await enqueueJob({
    userId,
    childId: sheet.child_id,
    type: 'rerender_pdf',
    input: { worksheetId: sheet.id, childId: sheet.child_id, paperSize: paper },
    dedupeKey: `rerender_pdf:${sheet.id}:${paper}`,
  })
  return { jobId }
}

/**
 * "Too hard / too easy". Logged as parent feedback, separate from graded evidence, and used only to shape the
 * NEXT worksheet's mix (US-011).
 */
export async function setDifficultyFeedback(
  supabase: SupabaseClient,
  cycleId: string,
  value: 'too_hard' | 'too_easy',
): Promise<void> {
  const cycle = await loadCycle(supabase, cycleId)
  if (cycle.status === 'complete') throw new AppError('CONFLICT')
  if (cycle.parent_difficulty_feedback === value) return

  const service = createServiceClient()
  const { error } = await service.from('cycles').update({ parent_difficulty_feedback: value }).eq('id', cycleId)
  if (error) throw new AppError('INTERNAL', { cause: error })

  const easier = value === 'too_hard'
  const { error: eventError } = await service.from('calibration_events').insert({
    child_id: cycle.child_id,
    cycle_id: cycleId,
    axis: 'math',
    from_level: 'current',
    to_level: easier ? 'easier' : 'harder',
    reason: easier
      ? 'You said the last sheet was too hard, so the next one will start gentler with more familiar skills.'
      : 'You said the last sheet was too easy, so the next one will include more challenge.',
    source: 'parent_feedback',
  })
  if (eventError) throw new AppError('INTERNAL', { cause: eventError })
}

/** Parent says they read the questions aloud, so those answers are kept out of the reading level. */
export async function setReadAloud(supabase: SupabaseClient, cycleId: string, readAloud: boolean): Promise<void> {
  const cycle = await loadCycle(supabase, cycleId)
  if (cycle.status !== 'ready') throw new AppError('CONFLICT', { message: 'This can only be changed before the sheet is uploaded.' })
  const { error } = await createServiceClient().from('cycles').update({ read_aloud: readAloud }).eq('id', cycleId)
  if (error) throw new AppError('INTERNAL', { cause: error })
}

/** "I think this answer is wrong": the question is left out of calibration and counted for quality monitoring. */
export async function flagWrongKey(
  supabase: SupabaseClient,
  userId: string,
  worksheetId: string,
  itemId: string,
): Promise<void> {
  const sheet = await loadWorksheet(supabase, worksheetId)
  const { data, error } = await supabase
    .from('worksheet_items')
    .select('id')
    .eq('id', itemId)
    .eq('worksheet_id', worksheetId)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', { cause: error })
  if (!data) throw new AppError('NOT_FOUND')

  const { error: updateError } = await createServiceClient()
    .from('worksheet_items')
    .update({ key_flagged_wrong: true })
    .eq('id', itemId)
  if (updateError) throw new AppError('INTERNAL', { cause: updateError })
  await recordUsage({ userId, childId: sheet.child_id, event: 'key.flagged' })
}
