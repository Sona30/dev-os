import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireChild } from '@/lib/children/children.service'
import { AppError } from '@/lib/errors/app-error'
import { confirmedValuesSchema } from '@/lib/schemas/reports'
import { ensureDiagnosisJob } from '@/lib/reports/reports.service'
import type { DiagnosisDto, DiagnosisGap, DiagnosisStrength } from './types'

const COLUMNS =
  'id, child_id, report_id, data_confidence, summary, gaps, strengths, recommendations, unmapped_items, kb_version, created_at'

interface DiagnosisRow {
  id: string
  child_id: string
  report_id: string
  data_confidence: 'high' | 'medium' | 'low'
  summary: string
  gaps: DiagnosisGap[]
  strengths: DiagnosisStrength[]
  recommendations: string[]
  unmapped_items: string[]
  kb_version: string
  created_at: string
}

async function toDto(supabase: SupabaseClient, row: DiagnosisRow): Promise<DiagnosisDto> {
  const child = await requireChild(supabase, row.child_id)

  // The basis shown on the Key Data card is what the parent confirmed for this report.
  const { data: report, error } = await supabase
    .from('reports')
    .select('confirmed_values')
    .eq('id', row.report_id)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', { cause: error })
  const confirmed = confirmedValuesSchema.safeParse((report as { confirmed_values: unknown } | null)?.confirmed_values)

  return {
    id: row.id,
    reportId: row.report_id,
    createdAt: row.created_at,
    dataConfidence: row.data_confidence,
    summary: row.summary,
    gaps: row.gaps,
    strengths: row.strengths,
    recommendations: row.recommendations,
    unmapped: row.unmapped_items,
    readingBand: { band: child.reading_band, estimated: child.reading_band_estimated },
    basis: {
      grade: child.grade,
      overallScore: confirmed.success ? confirmed.data.overallScore : null,
      placement: confirmed.success ? confirmed.data.placement : null,
      window: confirmed.success ? confirmed.data.window : null,
      lexile: child.lexile,
    },
    kbVersion: row.kb_version,
  }
}

export async function getDiagnosis(supabase: SupabaseClient, diagnosisId: string): Promise<DiagnosisDto> {
  const { data, error } = await supabase.from('diagnoses').select(COLUMNS).eq('id', diagnosisId).maybeSingle()
  if (error) throw new AppError('INTERNAL', { cause: error })
  if (!data) throw new AppError('NOT_FOUND')
  return toDto(supabase, data as DiagnosisRow)
}

/** Most recent gap analysis for a child, or null if none has been run. */
export async function findLatestDiagnosis(supabase: SupabaseClient, childId: string): Promise<DiagnosisDto | null> {
  const { data, error } = await supabase
    .from('diagnoses')
    .select(COLUMNS)
    .eq('child_id', childId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', { cause: error })
  return data ? toDto(supabase, data as DiagnosisRow) : null
}

export type StartDiagnosisResult = { diagnosisId: string; jobId: null } | { diagnosisId: null; jobId: string }

/**
 * Starts a gap analysis for a confirmed report. If one already exists for that report it is returned instead
 * (no second charge); a report the parent has not confirmed is refused (FR-03).
 */
export async function startDiagnosis(
  supabase: SupabaseClient,
  userId: string,
  childId: string,
  reportId: string,
): Promise<StartDiagnosisResult> {
  await requireChild(supabase, childId)

  const { data: report, error } = await supabase
    .from('reports')
    .select('id, child_id, confirmed_at')
    .eq('id', reportId)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', { cause: error })
  const row = report as { child_id: string; confirmed_at: string | null } | null
  if (!row || row.child_id !== childId) throw new AppError('NOT_FOUND')
  if (!row.confirmed_at) throw new AppError('REPORT_NOT_CONFIRMED')

  const { data: existing, error: existingError } = await supabase
    .from('diagnoses')
    .select('id')
    .eq('report_id', reportId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingError) throw new AppError('INTERNAL', { cause: existingError })
  if (existing) return { diagnosisId: (existing as { id: string }).id, jobId: null }

  return { diagnosisId: null, jobId: await ensureDiagnosisJob(userId, childId, reportId) }
}
