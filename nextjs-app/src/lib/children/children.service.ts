import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError } from '@/lib/errors/app-error'
import { deriveReadingBand } from '@/lib/reading/derive-reading-band'
import { createServiceClient } from '@/lib/supabase/service'
import type { CreateChildInput, UpdateChildInput } from '@/lib/schemas/children'
import {
  findChild,
  insertChild,
  listChildren,
  nicknameExists,
  toChildDto,
  updateChildRow,
  type ChildRow,
} from './children.repo'
import { looksLikeFullName, normalizeNickname } from './nickname'
import { NICKNAME_WARNING_FULL_NAME, type ChildDto, type ChildResponse } from './types'

interface BandChange {
  from: string
  to: string
}

/**
 * Works out how the child's reading baseline changes when a Lexile score is entered, removed, or (on the
 * first confirmed report) absent. Returns the column updates and, when an existing band moved, the change
 * to log. Pure — no I/O.
 */
export function readingBaselineUpdate(
  child: Pick<ChildRow, 'grade' | 'lexile' | 'reading_band'>,
  lexile: number | null,
): { values: Record<string, unknown>; bandChange: BandChange | null } {
  const values: Record<string, unknown> = {}
  let bandChange: BandChange | null = null

  if (lexile !== child.lexile) values.lexile = lexile

  if (lexile !== null) {
    const { band } = deriveReadingBand(child.grade, lexile)
    values.reading_band = band
    values.reading_band_estimated = false
    if (child.reading_band && child.reading_band !== band) {
      bandChange = { from: child.reading_band, to: band }
      // A new measured anchor restarts the reading-axis streaks (docs/specs/10 §5).
      values.reading_up_streak = 0
      values.reading_down_streak = 0
    }
  } else if (child.reading_band === null) {
    // No Lexile and no band yet: start from a conservative estimate and say so (FR-18).
    values.reading_band = deriveReadingBand(child.grade, null).band
    values.reading_band_estimated = true
  } else if (child.lexile !== null) {
    // The Lexile was removed: keep the band, but it is no longer backed by a measured value.
    values.reading_band_estimated = true
  }

  return { values, bandChange }
}

/** Logs a reading-band reset. Written with the service role after the caller has verified ownership. */
async function recordBandChange(childId: string, change: BandChange, lexile: number | null): Promise<void> {
  const { error } = await createServiceClient().from('calibration_events').insert({
    child_id: childId,
    axis: 'reading',
    from_level: change.from,
    to_level: change.to,
    reason: `A new Lexile score${lexile === null ? '' : ` (${lexile})`} moved the reading level from ${change.from} to ${change.to}.`,
    source: 'baseline_reset',
  })
  if (error) throw new AppError('INTERNAL', { cause: error })
}

/**
 * Applies a confirmed Lexile (or its absence) to the child's reading baseline.
 * Called when a report is confirmed (docs/specs/06 §4).
 */
export async function applyReadingBaseline(
  supabase: SupabaseClient,
  child: ChildRow,
  lexile: number | null,
): Promise<void> {
  const { values, bandChange } = readingBaselineUpdate(child, lexile)
  if (Object.keys(values).length === 0) return
  await updateChildRow(supabase, child.id, values)
  if (bandChange) await recordBandChange(child.id, bandChange, lexile)
}

function warningsFor(nickname: string): string[] {
  return looksLikeFullName(nickname) ? [NICKNAME_WARNING_FULL_NAME] : []
}

export async function getChildren(supabase: SupabaseClient): Promise<ChildDto[]> {
  return (await listChildren(supabase)).map(toChildDto)
}

/** Loads a child the signed-in parent owns, or throws NOT_FOUND (also for other people's children). */
export async function requireChild(supabase: SupabaseClient, childId: string): Promise<ChildRow> {
  const row = await findChild(supabase, childId)
  if (!row) throw new AppError('NOT_FOUND')
  return row
}

export async function getChild(supabase: SupabaseClient, childId: string): Promise<ChildDto> {
  return toChildDto(await requireChild(supabase, childId))
}

/** Replaces the generic CHILD_LIMIT text with the parent's actual plan limit. */
async function explainChildLimit(supabase: SupabaseClient, userId: string): Promise<AppError> {
  const { data } = await supabase.from('subscriptions').select('child_limit').eq('user_id', userId).maybeSingle()
  const limit = (data as { child_limit?: number } | null)?.child_limit ?? 3
  return new AppError('CHILD_LIMIT', {
    message: `Your plan allows up to ${limit} ${limit === 1 ? 'child' : 'children'}.`,
    details: { limit },
  })
}

export async function createChild(
  supabase: SupabaseClient,
  userId: string,
  input: CreateChildInput,
): Promise<ChildResponse> {
  const nickname = normalizeNickname(input.nickname)
  if (await nicknameExists(supabase, nickname)) throw new AppError('CHILD_EXISTS')

  try {
    const row = await insertChild(supabase, { user_id: userId, nickname, grade: input.grade })
    return { ...toChildDto(row), warnings: warningsFor(nickname) }
  } catch (error) {
    if (error instanceof AppError && error.code === 'CHILD_LIMIT') throw await explainChildLimit(supabase, userId)
    throw error
  }
}

export async function updateChild(
  supabase: SupabaseClient,
  childId: string,
  input: UpdateChildInput,
): Promise<ChildResponse> {
  const current = await requireChild(supabase, childId)
  const values: Record<string, unknown> = {}
  const warnings: string[] = []

  if (input.nickname !== undefined) {
    const nickname = normalizeNickname(input.nickname)
    if (nickname !== current.nickname) {
      if (await nicknameExists(supabase, nickname, childId)) throw new AppError('CHILD_EXISTS')
      values.nickname = nickname
      warnings.push(...warningsFor(nickname))
    }
  }

  if (input.grade !== undefined && input.grade !== current.grade) {
    // The database trigger rejects this with GRADE_LOCKED once a worksheet cycle exists.
    values.grade = input.grade
  }

  let bandChange: BandChange | null = null
  if (input.lexile !== undefined && input.lexile !== current.lexile) {
    const effectiveGrade = (values.grade as 1 | 2 | undefined) ?? current.grade
    const baseline = readingBaselineUpdate({ ...current, grade: effectiveGrade }, input.lexile)
    Object.assign(values, baseline.values)
    bandChange = baseline.bandChange
  }

  if (Object.keys(values).length === 0) return { ...toChildDto(current), warnings }

  const updated = await updateChildRow(supabase, childId, values)

  if (bandChange) await recordBandChange(childId, bandChange, input.lexile ?? null)

  return { ...toChildDto(updated), warnings }
}
