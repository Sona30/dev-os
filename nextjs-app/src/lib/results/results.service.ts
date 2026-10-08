import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { DISCLOSURE } from '@/lib/constants'
import { AppError } from '@/lib/errors/app-error'
import type { ErrorType, ItemStatus } from '@/lib/grading/types'
import type { ReadingBand } from '@/lib/schemas/common'
import type { FeedbackInput } from '@/lib/schemas/feedback'
import { getCatalog, indexBySkillId } from '@/lib/skills/catalog'
import { createServiceClient } from '@/lib/supabase/service'
import type {
  CalibrationEventDto,
  CycleListItemDto,
  MasteryResultDto,
  ReadingReadoutDto,
  ResultItemDto,
  ResultsDto,
} from './types'

// Reads a finished cycle for the parent. Everything shown was decided and stored when the sheet was
// recalibrated: no model call happens here (docs/specs/11 §4). The disclosure text is added here so it
// cannot be left out by any caller (FR-19).

const snapshotSchema = z.object({
  results: z
    .object({
      skillResults: z.array(
        z.object({
          skillId: z.string(),
          skillName: z.string(),
          label: z.enum(['secure', 'developing', 'not_yet', 'not_enough_evidence']),
          evidence: z.string(),
          trend: z.enum(['improving', 'steady', 'slipping']).nullable(),
          levelChange: z.object({ from: z.number(), to: z.number() }).nullable(),
          note: z.string().nullable(),
        }),
      ),
      readingReadout: z.object({
        verdict: z.enum(['reading_looks_fine', 'reading_may_be_limiting', 'not_enough_evidence']),
        text: z.string(),
        band: z.object({ from: z.enum(['R1', 'R2', 'R3', 'R4']), to: z.enum(['R1', 'R2', 'R3', 'R4']) }),
      }),
      flags: z.array(z.string()),
      recommendations: z.array(z.string()),
      activities: z.array(z.string()),
    })
    .optional(),
  noAttribution: z.boolean().optional(),
})

export type ResultsSnapshot = NonNullable<z.infer<typeof snapshotSchema>['results']>

/** Reads the stored snapshot written by the recalibrate job; tolerates an older or missing one. */
export function readSnapshot(focus: unknown): { results: ResultsSnapshot | null; noAttribution: boolean } {
  const parsed = snapshotSchema.safeParse(focus ?? {})
  if (!parsed.success) return { results: null, noAttribution: false }
  return { results: parsed.data.results ?? null, noAttribution: parsed.data.noAttribution === true }
}

interface CycleRow {
  id: string
  child_id: string
  cycle_number: number
  status: string
  summary: string | null
  calibration_text: string | null
  completed_at: string | null
  focus: unknown
}

const CYCLE_COLUMNS = 'id, child_id, cycle_number, status, summary, calibration_text, completed_at, focus'

interface GradedRow {
  system_status: ItemStatus
  final_status: ItemStatus | null
  error_type: ErrorType | null
  extraction_confidence: number
  needs_review: boolean
  parent_confirmed: boolean
  worksheet_items:
    | { position: number; skill_id: string; math_level: number; reading_band: ReadingBand; key_flagged_wrong: boolean }
    | Array<{ position: number; skill_id: string; math_level: number; reading_band: ReadingBand; key_flagged_wrong: boolean }>
    | null
}

function firstSentence(text: string | null): string {
  if (!text) return ''
  const match = /^.*?[.!?](\s|$)/.exec(text)
  return (match?.[0] ?? text).trim()
}

export async function listCycles(supabase: SupabaseClient, childId: string): Promise<CycleListItemDto[]> {
  const { data, error } = await supabase
    .from('cycles')
    .select(CYCLE_COLUMNS)
    .eq('child_id', childId)
    .eq('status', 'complete')
    .order('cycle_number', { ascending: false })
  if (error) throw new AppError('INTERNAL', { cause: error })
  const cycles = (data ?? []) as CycleRow[]
  if (cycles.length === 0) return []

  const { data: sheets, error: sheetError } = await supabase
    .from('worksheets')
    .select('cycle_id, sheet_id')
    .in('cycle_id', cycles.map((cycle) => cycle.id))
    .eq('is_current', true)
  if (sheetError) throw new AppError('INTERNAL', { cause: sheetError })
  const sheetByCycle = new Map(((sheets ?? []) as Array<{ cycle_id: string; sheet_id: string }>).map((row) => [row.cycle_id, row.sheet_id]))

  return cycles.map((cycle) => ({
    id: cycle.id,
    number: cycle.cycle_number,
    status: cycle.status,
    sheetId: sheetByCycle.get(cycle.id) ?? null,
    date: cycle.completed_at,
    headline: firstSentence(cycle.summary),
  }))
}

/** The full results for a completed cycle. */
export async function getResults(supabase: SupabaseClient, userId: string, cycleId: string): Promise<ResultsDto> {
  const { data, error } = await supabase.from('cycles').select(CYCLE_COLUMNS).eq('id', cycleId).maybeSingle()
  if (error) throw new AppError('INTERNAL', { cause: error })
  if (!data) throw new AppError('NOT_FOUND')
  const cycle = data as CycleRow
  if (cycle.status !== 'complete') {
    throw new AppError('NOT_COMPLETE', { details: { status: cycle.status } })
  }

  const catalog = indexBySkillId(await getCatalog())
  const { results, noAttribution } = readSnapshot(cycle.focus)

  const { data: sheet, error: sheetError } = await supabase
    .from('worksheets')
    .select('id, sheet_id')
    .eq('cycle_id', cycleId)
    .eq('is_current', true)
    .maybeSingle()
  if (sheetError) throw new AppError('INTERNAL', { cause: sheetError })
  const worksheet = sheet as { id: string; sheet_id: string } | null

  const { data: graded, error: gradedError } = await supabase
    .from('graded_items')
    .select(
      'system_status, final_status, error_type, extraction_confidence, needs_review, parent_confirmed, worksheet_items(position, skill_id, math_level, reading_band, key_flagged_wrong)',
    )
    .eq('cycle_id', cycleId)
  if (gradedError) throw new AppError('INTERNAL', { cause: gradedError })

  const items: ResultItemDto[] = []
  for (const row of (graded ?? []) as unknown as GradedRow[]) {
    const item = Array.isArray(row.worksheet_items) ? row.worksheet_items[0] : row.worksheet_items
    if (!item) continue
    const confirmed = row.parent_confirmed || !row.needs_review
    const notCountedReason = item.key_flagged_wrong
      ? ('key_flagged' as const)
      : !confirmed
        ? ('unconfirmed' as const)
        : noAttribution
          ? ('no_attribution' as const)
          : undefined
    items.push({
      position: item.position,
      skillId: item.skill_id,
      skillName: catalog.get(item.skill_id)?.name ?? item.skill_id,
      mathLevel: item.math_level,
      readingBand: item.reading_band,
      result: row.final_status ?? row.system_status,
      errorType: row.error_type,
      extractionConfidence: row.extraction_confidence,
      counted: notCountedReason === undefined,
      ...(notCountedReason ? { notCountedReason } : {}),
    })
  }
  items.sort((a, b) => a.position - b.position)

  const { data: events, error: eventsError } = await supabase
    .from('calibration_events')
    .select('axis, skill_id, from_level, to_level, reason')
    .eq('cycle_id', cycleId)
    .order('created_at', { ascending: true })
  if (eventsError) throw new AppError('INTERNAL', { cause: eventsError })
  const calibrationEvents: CalibrationEventDto[] = (
    (events ?? []) as Array<{ axis: 'math' | 'reading'; skill_id: string | null; from_level: string; to_level: string; reason: string }>
  ).map((event) => ({
    axis: event.axis,
    skillName: event.skill_id ? (catalog.get(event.skill_id)?.name ?? null) : null,
    from: event.from_level,
    to: event.to_level,
    reason: event.reason,
  }))

  let feedback: ResultsDto['feedback'] = null
  if (worksheet) {
    const { data: rated, error: feedbackError } = await supabase
      .from('feedback')
      .select('rating, comment')
      .eq('worksheet_id', worksheet.id)
      .eq('user_id', userId)
      .maybeSingle()
    if (feedbackError) throw new AppError('INTERNAL', { cause: feedbackError })
    if (rated) feedback = rated as { rating: number; comment: string | null }
  }

  const mastery: MasteryResultDto[] = results?.skillResults ?? []
  const readingReadout: ReadingReadoutDto = results?.readingReadout ?? {
    verdict: 'not_enough_evidence',
    text: 'Reading was not assessed on this sheet.',
    band: { from: 'R2', to: 'R2' },
  }

  return {
    cycle: {
      id: cycle.id,
      number: cycle.cycle_number,
      worksheetId: worksheet?.id ?? null,
      sheetId: worksheet?.sheet_id ?? null,
      completedAt: cycle.completed_at,
    },
    summary: cycle.summary ?? '',
    items,
    mastery,
    readingReadout,
    recommendations: results?.recommendations ?? [],
    activities: results?.activities ?? [],
    calibration: { text: cycle.calibration_text ?? '', events: calibrationEvents },
    flags: results?.flags ?? [],
    disclosure: DISCLOSURE,
    feedback,
  }
}

/** One rating per parent per worksheet; rating again replaces it. */
export async function saveFeedback(supabase: SupabaseClient, userId: string, input: FeedbackInput): Promise<void> {
  // Ownership first: RLS only returns worksheets that belong to the signed-in parent.
  const { data, error } = await supabase
    .from('worksheets')
    .select('id, cycle_id')
    .eq('id', input.worksheetId)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', { cause: error })
  const worksheet = data as { id: string; cycle_id: string } | null
  if (!worksheet) throw new AppError('NOT_FOUND')

  const { error: upsertError } = await createServiceClient()
    .from('feedback')
    .upsert(
      {
        user_id: userId,
        worksheet_id: worksheet.id,
        cycle_id: worksheet.cycle_id,
        rating: input.rating,
        comment: input.comment && input.comment.length > 0 ? input.comment : null,
      },
      { onConflict: 'user_id,worksheet_id' },
    )
  if (upsertError) throw new AppError('INTERNAL', { cause: upsertError })
}
