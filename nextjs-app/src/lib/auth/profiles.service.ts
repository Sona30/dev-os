import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError } from '@/lib/errors/app-error'
import type { ProfilePatch } from '@/lib/schemas/auth'

export interface ProfileDto {
  id: string
  email: string
  paperSize: 'letter' | 'a4'
  locale: string
}

interface ProfileRow {
  id: string
  email: string
  paper_size: 'letter' | 'a4'
  locale: string
}

const COLUMNS = 'id, email, paper_size, locale'

function toDto(row: ProfileRow): ProfileDto {
  return { id: row.id, email: row.email, paperSize: row.paper_size, locale: row.locale }
}

/** Reads the signed-in user's profile through RLS (the user can only ever see their own row). */
export async function getProfile(supabase: SupabaseClient, userId: string): Promise<ProfileDto> {
  const { data, error } = await supabase.from('profiles').select(COLUMNS).eq('id', userId).maybeSingle()
  if (error) throw new AppError('INTERNAL', { cause: error })
  if (!data) {
    // The on_auth_user_created trigger should always create this row; a miss means the schema was not applied.
    throw new AppError('INTERNAL', { cause: new Error(`profiles row missing for user ${userId}`) })
  }
  return toDto(data as ProfileRow)
}

export async function updateProfile(
  supabase: SupabaseClient,
  userId: string,
  patch: ProfilePatch,
): Promise<ProfileDto> {
  const update: Record<string, string> = {}
  if (patch.paperSize !== undefined) update.paper_size = patch.paperSize
  if (patch.locale !== undefined) update.locale = patch.locale

  const { data, error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', userId)
    .select(COLUMNS)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', { cause: error })
  if (!data) throw new AppError('NOT_FOUND')
  return toDto(data as ProfileRow)
}
