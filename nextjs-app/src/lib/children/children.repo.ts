import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError } from '@/lib/errors/app-error'
import type { ChildDto } from './types'

// Data access for `children`. Parents read and write their own rows through the user-scoped client,
// so Row Level Security is the authorisation boundary (docs/specs/00 §9 R1).

export const CHILD_COLUMNS =
  'id, user_id, nickname, grade, lexile, reading_band, reading_band_estimated, reading_confidence, current_cycle, created_at'

export interface ChildRow {
  id: string
  user_id: string
  nickname: string
  grade: 1 | 2
  lexile: number | null
  reading_band: 'R1' | 'R2' | 'R3' | 'R4' | null
  reading_band_estimated: boolean
  reading_confidence: 'low' | 'med' | 'high'
  current_cycle: number
  created_at: string
}

export function toChildDto(row: ChildRow): ChildDto {
  return {
    id: row.id,
    nickname: row.nickname,
    grade: row.grade,
    lexile: row.lexile,
    readingBand: row.reading_band,
    readingBandEstimated: row.reading_band_estimated,
    readingConfidence: row.reading_confidence,
    currentCycle: row.current_cycle,
    createdAt: row.created_at,
  }
}

/** Maps Postgres/PostgREST failures (constraints and our trigger exceptions) to AppErrors. */
export function mapChildWriteError(error: { code?: string; message?: string }): AppError {
  if (error.code === '23505') return new AppError('CHILD_EXISTS')
  if (error.message?.includes('CHILD_LIMIT')) return new AppError('CHILD_LIMIT')
  if (error.message?.includes('GRADE_LOCKED')) return new AppError('GRADE_LOCKED')
  return new AppError('INTERNAL', { cause: error })
}

export async function listChildren(supabase: SupabaseClient): Promise<ChildRow[]> {
  const { data, error } = await supabase
    .from('children')
    .select(CHILD_COLUMNS)
    .order('created_at', { ascending: true })
  if (error) throw new AppError('INTERNAL', { cause: error })
  return (data ?? []) as ChildRow[]
}

/** Returns the child, or null when it does not exist or belongs to someone else (RLS hides it). */
export async function findChild(supabase: SupabaseClient, childId: string): Promise<ChildRow | null> {
  const { data, error } = await supabase.from('children').select(CHILD_COLUMNS).eq('id', childId).maybeSingle()
  if (error) throw new AppError('INTERNAL', { cause: error })
  return (data as ChildRow | null) ?? null
}

/** Case-insensitive nickname lookup within the signed-in user's children. */
export async function nicknameExists(
  supabase: SupabaseClient,
  nickname: string,
  excludeChildId?: string,
): Promise<boolean> {
  let query = supabase.from('children').select('id').ilike('nickname', nickname).limit(1)
  if (excludeChildId) query = query.neq('id', excludeChildId)
  const { data, error } = await query
  if (error) throw new AppError('INTERNAL', { cause: error })
  return (data ?? []).length > 0
}

export async function insertChild(
  supabase: SupabaseClient,
  values: { user_id: string; nickname: string; grade: 1 | 2 },
): Promise<ChildRow> {
  const { data, error } = await supabase.from('children').insert(values).select(CHILD_COLUMNS).single()
  if (error) throw mapChildWriteError(error)
  return data as ChildRow
}

export async function updateChildRow(
  supabase: SupabaseClient,
  childId: string,
  values: Record<string, unknown>,
): Promise<ChildRow> {
  const { data, error } = await supabase
    .from('children')
    .update(values)
    .eq('id', childId)
    .select(CHILD_COLUMNS)
    .maybeSingle()
  if (error) throw mapChildWriteError(error)
  if (!data) throw new AppError('NOT_FOUND')
  return data as ChildRow
}
