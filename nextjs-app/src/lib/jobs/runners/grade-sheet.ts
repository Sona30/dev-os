import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { buildChildProfile } from '@/lib/children/build-child-profile'
import { EXTRACTION_CONFIDENCE_THRESHOLD, MAX_JOB_ATTEMPTS } from '@/lib/constants'
import { AppError } from '@/lib/errors/app-error'
import { callAgent } from '@/lib/foundry/client'
import type { AgentImage, AgentImageMime } from '@/lib/foundry/types'
import { cropAnswer, fallbackBox } from '@/lib/grading/crops'
import { compareAnswer } from '@/lib/grading/compare'
import { needsParentReview, refineErrorType, settleStatus } from '@/lib/grading/routing'
import type { ErrorType, ItemStatus } from '@/lib/grading/types'
import { QUALITY_THRESHOLDS } from '@/lib/images/metrics'
import { uuid } from '@/lib/schemas/common'
import { createReadUrl } from '@/lib/storage/signed-urls'
import { enqueueJob } from '../enqueue'
import { recordUsage } from '@/lib/usage/record'
import type { JobContext, JobRunner } from '../context'
import { isRetryableCode, toJobFailure } from '../errors'

const inputSchema = z
  .object({
    worksheetId: uuid,
    cycleId: uuid,
    childId: uuid,
    uploadIds: z.array(uuid).min(1).max(4),
    readAloud: z.boolean(),
    /** The parent says this photo is the sheet even though we could not read its ID. */
    confirmSheet: z.boolean().optional(),
    /** False means: score the answers, but do not tie them to skills. */
    attributeSkills: z.boolean().optional(),
  })
  .passthrough()

const IMAGE_URL_TTL_SECONDS = 600
const SHEET_ID_MIN_CONFIDENCE = 0.8
const FALLBACK_CROP_MAX_CONFIDENCE = 0.5
const CROP_CONCURRENCY = 4
const CROP_TIMEOUT_MS = 25_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}
const AGENT_MIMES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

interface KeyRow {
  id: string
  position: number
  skill_id: string
  math_level: number
  reading_band: 'R1' | 'R2' | 'R3' | 'R4'
  pair_id: string | null
  question_text: string
  answer_type: 'integer' | 'text' | 'choice'
  correct_answer: string
  accepted_answers: string[]
  verification: { pairRole?: 'low_reading' | 'target_reading' | null } | null
}

interface UploadRow {
  id: string
  storage_path: string
  mime: string
  quality_score: number | null
}

const normaliseSheetId = (value: string | null) => (value ?? '').replace(/\s+/g, '').toUpperCase()

/** On a final failure the sheet goes back to "ready" so the parent can try again; bad photos are discarded at once. */
async function settleCycleOnFailure(ctx: JobContext, error: unknown): Promise<void> {
  const parsed = inputSchema.safeParse(ctx.job.input)
  if (!parsed.success) return
  const failure = toJobFailure(error)
  const terminal = !isRetryableCode(failure.code) || ctx.job.attempts >= MAX_JOB_ATTEMPTS
  if (!terminal) return

  const { cycleId, uploadIds } = parsed.data
  if (failure.code === 'PHOTO_QUALITY') await discardUploads(ctx, uploadIds)
  const { error: updateError } = await ctx.service.from('cycles').update({ status: 'ready' }).eq('id', cycleId)
  if (updateError) ctx.log.error({ err: updateError }, 'could not return the cycle to ready after a failed grading')
}

async function discardUploads(ctx: JobContext, uploadIds: string[]): Promise<void> {
  const { data } = await ctx.service.from('uploads').select('id, storage_path').in('id', uploadIds)
  const rows = (data ?? []) as Array<{ id: string; storage_path: string }>
  if (rows.length === 0) return
  await ctx.service.storage.from('uploads').remove(rows.map((row) => row.storage_path))
  await ctx.service.from('uploads').delete().in('id', rows.map((row) => row.id))
}

export const runGradeSheet: JobRunner = async (ctx) => {
  try {
    return await grade(ctx)
  } catch (error) {
    await settleCycleOnFailure(ctx, error)
    throw error
  }
}

async function grade(ctx: JobContext): Promise<Record<string, unknown>> {
  const { job, service, setProgress, assertChildExists, log } = ctx
  const input = inputSchema.parse(job.input)
  const threshold = Number(process.env.EXTRACTION_CONFIDENCE_THRESHOLD) || EXTRACTION_CONFIDENCE_THRESHOLD

  // ---- Load and verify ownership ----
  const { data: cycleRow, error: cycleError } = await service
    .from('cycles')
    .select('id, child_id, cycle_number, status, focus')
    .eq('id', input.cycleId)
    .maybeSingle()
  if (cycleError) throw new AppError('INTERNAL', { cause: cycleError })
  const cycle = cycleRow as {
    id: string
    child_id: string
    cycle_number: number
    status: string
    focus: Record<string, unknown> | null
  } | null
  if (!cycle || cycle.child_id !== input.childId) throw new AppError('NOT_FOUND')

  const { data: sheetRow, error: sheetError } = await service
    .from('worksheets')
    .select('id, child_id, cycle_id, sheet_id, verified_at, is_current')
    .eq('id', input.worksheetId)
    .maybeSingle()
  if (sheetError) throw new AppError('INTERNAL', { cause: sheetError })
  const sheet = sheetRow as { child_id: string; cycle_id: string; sheet_id: string; verified_at: string | null; is_current: boolean } | null
  if (!sheet || sheet.child_id !== input.childId || sheet.cycle_id !== cycle.id || !sheet.verified_at || !sheet.is_current) {
    throw new AppError('NOT_FOUND')
  }

  const { data: childRow, error: childError } = await service
    .from('children')
    .select('id, user_id')
    .eq('id', input.childId)
    .maybeSingle()
  if (childError) throw new AppError('INTERNAL', { cause: childError })
  const child = childRow as { user_id: string } | null
  if (!child || child.user_id !== job.user_id) throw new AppError('NOT_FOUND')

  // ---- Idempotency: grading the same sheet twice must not create a second set of results ----
  if (cycle.status === 'needs_review' || cycle.status === 'graded' || cycle.status === 'complete') {
    return { cycleId: cycle.id, alreadyGraded: true }
  }

  await setProgress('checking_photo')
  const { data: uploadRows, error: uploadError } = await service
    .from('uploads')
    .select('id, storage_path, mime, quality_score')
    .in('id', input.uploadIds)
    .eq('child_id', input.childId)
    .eq('kind', 'completed_sheet')
    .eq('confirmed_uploaded', true)
    .is('deleted_at', null)
    .order('page_no', { ascending: true })
  if (uploadError) throw new AppError('INTERNAL', { cause: uploadError })
  const uploads = (uploadRows ?? []) as UploadRow[]
  if (uploads.length !== input.uploadIds.length) {
    throw new AppError('CONFLICT', { message: 'Some of those photos are no longer available. Please add them again.' })
  }
  if (uploads.some((upload) => !AGENT_MIMES.includes(upload.mime))) throw new AppError('UNSUPPORTED_MEDIA')

  // Every photo too blurry, dark or cut off: nothing is graded and the photos are deleted (data minimisation).
  const scored = uploads.filter((upload) => upload.quality_score !== null)
  if (scored.length === uploads.length && scored.every((upload) => (upload.quality_score as number) < QUALITY_THRESHOLDS.hardFailScore)) {
    throw new AppError('PHOTO_QUALITY')
  }

  // ---- The stored key for this exact sheet. The model compares against it; it never recalls answers. ----
  const { data: keyRows, error: keyError } = await service
    .from('worksheet_items')
    .select(
      'id, position, skill_id, math_level, reading_band, pair_id, question_text, answer_type, correct_answer, accepted_answers, verification',
    )
    .eq('worksheet_id', input.worksheetId)
    .order('position', { ascending: true })
  if (keyError) throw new AppError('INTERNAL', { cause: keyError })
  const key = (keyRows ?? []) as KeyRow[]
  if (key.length === 0) throw new AppError('NOT_FOUND')

  const images: AgentImage[] = []
  for (const [index, upload] of uploads.entries()) {
    const url = await createReadUrl(service, 'uploads', upload.storage_path, IMAGE_URL_TTL_SECONDS)
    images.push({
      url,
      mime: upload.mime as AgentImageMime,
      label: `Completed sheet, page ${index + 1} of ${uploads.length}`,
    })
  }

  await assertChildExists()
  await setProgress('reading_answers')
  const childProfile = await buildChildProfile(service, input.childId)
  const result = await callAgent({
    mode: 'grade',
    input: {
      sheet_id: sheet.sheet_id,
      key: key.map((row) => ({
        position: row.position,
        question_text: row.question_text,
        answer_type: row.answer_type,
        correct_answer: row.correct_answer,
        accepted_answers: row.accepted_answers,
        skill_id: row.skill_id,
        math_level: row.math_level,
        reading_band: row.reading_band,
        pair_id: row.pair_id,
        pair_role: row.verification?.pairRole ?? null,
      })),
      child_profile: childProfile,
    },
    images,
    usage: { userId: job.user_id, childId: input.childId, jobId: job.id },
  })
  const graded = result.data

  // ---- Is this photo of this sheet? ----
  const sheetMatches =
    normaliseSheetId(graded.sheetId) === normaliseSheetId(sheet.sheet_id) && graded.sheetIdConfidence >= SHEET_ID_MIN_CONFIDENCE
  if (!sheetMatches && !input.confirmSheet) {
    // Nothing is stored. The parent confirms that this is the right sheet, or just has the answers checked.
    const { error } = await service.from('cycles').update({ status: 'ready' }).eq('id', cycle.id)
    if (error) throw new AppError('INTERNAL', { cause: error })
    return {
      cycleId: cycle.id,
      needsSheetConfirmation: true,
      readSheetId: graded.sheetId,
      expectedSheetId: sheet.sheet_id,
    }
  }
  const attribute = sheetMatches ? true : (input.attributeSkills ?? true)

  // ---- Re-judge every answer in code, route doubtful ones to the parent ----
  await setProgress('checking_answers')
  const byPosition = new Map(graded.items.map((item) => [item.position, item]))
  const partnerOf = (row: KeyRow) =>
    row.pair_id ? key.find((other) => other.pair_id === row.pair_id && other.id !== row.id) : undefined

  interface Judged {
    row: KeyRow
    extracted: string | null
    confidence: number
    modelStatus: ItemStatus
    status: ItemStatus
    modelErrorType: ErrorType | null
    methodSound: boolean | null
    methodEvidence: string | null
    flagged: boolean
    box: { x: number; y: number; w: number; h: number; page: number } | null
    usedFallbackBox: boolean
  }

  const judged: Judged[] = key.map((row) => {
    const read = byPosition.get(row.position)
    const missing = !read
    const comparison = compareAnswer(read?.extractedAnswer, {
      answerType: row.answer_type,
      correctAnswer: row.correct_answer,
      acceptedAnswers: row.accepted_answers,
    })
    const modelStatus: ItemStatus = read?.status ?? 'blank'
    const status = settleStatus({
      comparison: comparison.status,
      unitMissing: comparison.unitMissing,
      modelStatus,
      modelErrorType: read?.errorType ?? null,
      methodSound: read?.methodSound ?? null,
    })
    // A question we could not find at all is never silently "blank": the parent is asked.
    const confidence = missing ? 0.3 : Math.round((read?.extractionConfidence ?? 0) * 100) / 100
    const usedFallbackBox = !missing && read?.boundingBox === null
    return {
      row,
      extracted: read?.extractedAnswer ?? null,
      confidence: usedFallbackBox ? Math.min(confidence, FALLBACK_CROP_MAX_CONFIDENCE) : confidence,
      modelStatus,
      status,
      modelErrorType: read?.errorType ?? null,
      methodSound: read?.methodSound ?? null,
      methodEvidence: read?.methodEvidence ?? null,
      flagged: false,
      box: read?.boundingBox ?? null,
      usedFallbackBox,
    }
  })
  for (const item of judged) {
    item.flagged = needsParentReview({
      confidence: item.confidence,
      threshold,
      modelStatus: item.modelStatus,
      finalStatus: item.status,
    })
  }
  const statusByRowId = new Map(judged.map((item) => [item.row.id, item.status]))

  // ---- Crop the doubtful answers for the review queue ----
  // Each page is downloaded once and shared by every crop that needs it. Crops run a few at a time and each has a
  // time limit: the picture is a convenience (the parent can still type the answer), so a slow storage call must
  // never hold up, or fail, the whole grading job.
  const pagePromises = new Map<number, Promise<Buffer | null>>()
  const loadPage = (pageIndex: number): Promise<Buffer | null> => {
    const cached = pagePromises.get(pageIndex)
    if (cached) return cached
    const upload = uploads[pageIndex]
    const pending = (async () => {
      if (!upload) return null
      const { data, error } = await service.storage.from('uploads').download(upload.storage_path)
      if (error || !data) return null
      return Buffer.from(await data.arrayBuffer())
    })()
    pagePromises.set(pageIndex, pending)
    return pending
  }
  const pageIndexOf = (item: Judged) => Math.max(0, Math.min(uploads.length - 1, (item.box?.page ?? 1) - 1))

  const cropForReview = async (item: Judged): Promise<string | null> => {
    const page = await loadPage(pageIndexOf(item))
    if (!page) return null
    const box = item.box ?? fallbackBox(item.row.position, key.length)
    const jpeg = await cropAnswer(page, box)
    const cropId = randomUUID()
    const cropPath = `${job.user_id}/${input.childId}/item_crop/${cropId}.jpg`
    const { error: uploadCropError } = await service.storage
      .from('uploads')
      .upload(cropPath, jpeg, { contentType: 'image/jpeg', upsert: false })
    if (uploadCropError) throw uploadCropError
    const { error: rowError } = await service.from('uploads').insert({
      id: cropId,
      user_id: job.user_id,
      child_id: input.childId,
      kind: 'item_crop',
      worksheet_id: input.worksheetId,
      storage_path: cropPath,
      mime: 'image/jpeg',
      bytes: jpeg.length,
      confirmed_uploaded: true,
    })
    if (rowError) throw rowError
    return cropPath
  }

  const cropPaths = new Map<string, string | null>()
  const toCrop = judged.filter((item) => item.flagged)
  for (let first = 0; first < toCrop.length; first += CROP_CONCURRENCY) {
    await Promise.all(
      toCrop.slice(first, first + CROP_CONCURRENCY).map(async (item) => {
        try {
          cropPaths.set(item.row.id, await withTimeout(cropForReview(item), CROP_TIMEOUT_MS))
        } catch (error) {
          // The queue still works without the picture; the parent sees the extracted value and types the answer.
          cropPaths.set(item.row.id, null)
          log.warn({ err: error, position: item.row.position }, 'could not crop an answer for review')
        }
      }),
    )
  }

  const rows: Array<Record<string, unknown> & { needs_review: boolean }> = []
  for (const item of judged) {
    const pageIndex = pageIndexOf(item)
    const cropPath = cropPaths.get(item.row.id) ?? null

    const partner = partnerOf(item.row)
    const errorType = refineErrorType({
      finalStatus: item.status,
      modelErrorType: item.modelErrorType,
      methodSound: item.methodSound,
      pair: item.row.pair_id && item.row.verification?.pairRole
        ? { role: item.row.verification.pairRole, partnerStatus: partner ? (statusByRowId.get(partner.id) ?? null) : null }
        : null,
    })

    rows.push({
      worksheet_item_id: item.row.id,
      cycle_id: cycle.id,
      upload_id: uploads[pageIndex]?.id ?? null,
      extracted_answer: item.extracted,
      extraction_confidence: item.confidence,
      system_status: item.status,
      error_type: errorType,
      method_evidence: item.methodEvidence,
      method_sound: item.methodSound,
      needs_review: item.flagged,
      crop_path: cropPath,
    })
  }

  // Replace any partial results from an earlier attempt, then store the new ones.
  const { error: clearError } = await service.from('graded_items').delete().eq('cycle_id', cycle.id)
  if (clearError) throw new AppError('INTERNAL', { cause: clearError })
  const { error: insertError } = await service.from('graded_items').insert(rows)
  if (insertError) throw new AppError('INTERNAL', { cause: insertError })

  // Link the photos to the sheet and finish: the cycle waits for review, or is ready for its results.
  const { error: linkError } = await service.from('uploads').update({ worksheet_id: input.worksheetId }).in('id', input.uploadIds)
  if (linkError) throw new AppError('INTERNAL', { cause: linkError })

  const flaggedCount = rows.filter((row) => row.needs_review).length
  const { error: finishError } = await service
    .from('cycles')
    .update({
      status: flaggedCount > 0 ? 'needs_review' : 'graded',
      read_aloud: input.readAloud,
      focus: { ...(cycle.focus ?? {}), noAttribution: !attribute },
    })
    .eq('id', cycle.id)
  if (finishError) throw new AppError('INTERNAL', { cause: finishError })

  await recordUsage({ userId: job.user_id, childId: input.childId, jobId: job.id, event: 'cycle.graded' })

  // Nothing for the parent to check: go straight on to updating the levels.
  if (flaggedCount === 0) {
    try {
      await enqueueJob({
        userId: job.user_id,
        childId: input.childId,
        type: 'recalibrate',
        input: { cycleId: cycle.id, childId: input.childId },
        dedupeKey: `recalibrate:${cycle.id}`,
      })
    } catch (error) {
      // The Results page offers "Update levels" if this did not start, so grading itself still succeeds.
      log.warn({ err: error }, 'could not start the recalibration automatically')
    }
  }
  return { cycleId: cycle.id, flaggedCount, noAttribution: !attribute }
}
