import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { applyReadingBaseline, requireChild } from '@/lib/children/children.service'
import { refreshChildProfileCache } from '@/lib/children/build-child-profile'
import type { ChildRow } from '@/lib/children/children.repo'
import { AppError } from '@/lib/errors/app-error'
import { enqueueJob } from '@/lib/jobs/enqueue'
import { getLogger } from '@/lib/logger'
import type { Grade } from '@/lib/schemas/common'
import { confirmedValuesSchema, type ConfirmedValues, type ManualReportInput } from '@/lib/schemas/reports'
import { createServiceClient } from '@/lib/supabase/service'
import { recordUsage } from '@/lib/usage/record'
import { draftFromParsed } from './draft'
import { checkPlacement } from './placements'
import type { ParseStatus, ReportDto } from './types'

const COLUMNS = 'id, child_id, source, parse_status, parsed_values, confirmed_values, confirmed_at, created_at'

interface ReportRow {
  id: string
  child_id: string
  source: 'upload' | 'manual'
  parse_status: ParseStatus
  parsed_values: unknown
  confirmed_values: unknown
  confirmed_at: string | null
  created_at: string
}

/** Rejects a placement that clearly belongs to a different grade than the child's (US-001). */
function assertPlacementMatchesGrade(grade: Grade, values: Pick<ConfirmedValues, 'placement' | 'domainResults'>): void {
  const texts = [values.placement, ...values.domainResults.map((domain) => domain.placement)].filter(
    (text): text is string => text !== null,
  )
  if (texts.some((text) => checkPlacement(grade, text) === 'contradictory')) {
    throw new AppError('CONTRADICTORY_INPUT')
  }
}

async function latestJobId(supabase: SupabaseClient, type: string, reportId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('jobs')
    .select('id')
    .eq('type', type)
    .contains('input', { reportId })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', { cause: error })
  return (data as { id: string } | null)?.id ?? null
}

async function reportHasDiagnosis(supabase: SupabaseClient, reportId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('diagnoses')
    .select('id', { count: 'exact', head: true })
    .eq('report_id', reportId)
  if (error) throw new AppError('INTERNAL', { cause: error })
  return (count ?? 0) > 0
}

async function toReportDto(supabase: SupabaseClient, row: ReportRow, childLexile: number | null): Promise<ReportDto> {
  const confirmed = row.confirmed_at ? confirmedValuesSchema.safeParse(row.confirmed_values) : null
  const parsed = row.parsed_values as { status?: string; rejectReason?: string | null } | null

  const [hasDiagnosis, parseJobId, diagnoseJobId] = await Promise.all([
    reportHasDiagnosis(supabase, row.id),
    row.source === 'upload' ? latestJobId(supabase, 'parse_report', row.id) : Promise.resolve(null),
    latestJobId(supabase, 'diagnose', row.id),
  ])

  return {
    id: row.id,
    childId: row.child_id,
    source: row.source,
    parseStatus: row.parse_status,
    rejectReason: row.parse_status === 'failed' ? (parsed?.rejectReason ?? null) : null,
    draft: !row.confirmed_at && (row.parse_status === 'parsed' || row.parse_status === 'manual')
      ? draftFromParsed(row.parsed_values, childLexile)
      : null,
    confirmed: confirmed?.success ? confirmed.data : null,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    hasDiagnosis,
    parseJobId,
    diagnoseJobId,
  }
}

export async function getReport(supabase: SupabaseClient, reportId: string): Promise<ReportDto> {
  const { data, error } = await supabase.from('reports').select(COLUMNS).eq('id', reportId).maybeSingle()
  if (error) throw new AppError('INTERNAL', { cause: error })
  if (!data) throw new AppError('NOT_FOUND')
  const row = data as ReportRow
  const child = await requireChild(supabase, row.child_id)
  return toReportDto(supabase, row, child.lexile)
}

/** The child's most recent report (any state), or null if they have none yet. */
export async function getLatestReport(supabase: SupabaseClient, child: ChildRow): Promise<ReportDto | null> {
  const { data, error } = await supabase
    .from('reports')
    .select(COLUMNS)
    .eq('child_id', child.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', { cause: error })
  return data ? toReportDto(supabase, data as ReportRow, child.lexile) : null
}

/**
 * Typed-in score or placement: no AI involved, goes straight to the confirm step (FR-01).
 * `child` must come from requireChild() (ownership checked through RLS); the row is then written with the
 * service role because parents have no direct write access to `reports` (supabase/rls-policies.sql).
 */
export async function createManualReport(
  supabase: SupabaseClient,
  child: ChildRow,
  manual: ManualReportInput,
): Promise<ReportDto> {
  if (manual.placement !== undefined) assertPlacementMatchesGrade(child.grade, { placement: manual.placement, domainResults: [] })

  const { data, error } = await createServiceClient()
    .from('reports')
    .insert({
      child_id: child.id,
      source: 'manual',
      parse_status: 'manual',
      overall_score: manual.overallScore ?? null,
      placement: manual.placement ?? null,
      assessment_window: manual.window ?? null,
      parsed_values: {
        manual: true,
        window: manual.window ?? null,
        overallScore: manual.overallScore ?? null,
        placement: manual.placement ?? null,
        lexile: manual.lexile ?? null,
      },
    })
    .select(COLUMNS)
    .single()
  if (error) throw new AppError('INTERNAL', { cause: error })
  return toReportDto(supabase, data as ReportRow, child.lexile)
}

/** Report pages the parent uploaded: creates the report and starts the parse job. */
export async function createUploadReport(
  supabase: SupabaseClient,
  userId: string,
  child: ChildRow,
  uploadIds: string[],
): Promise<{ report: ReportDto; jobId: string }> {
  const unique = Array.from(new Set(uploadIds))
  const { data, error } = await supabase
    .from('uploads')
    .select('id, child_id, kind, report_id, confirmed_uploaded, deleted_at')
    .in('id', unique)
  if (error) throw new AppError('INTERNAL', { cause: error })

  const pages = (data ?? []) as Array<{
    id: string
    child_id: string
    kind: string
    report_id: string | null
    confirmed_uploaded: boolean
    deleted_at: string | null
  }>
  const usable =
    pages.length === unique.length &&
    pages.every(
      (page) =>
        page.child_id === child.id &&
        page.kind === 'report_page' &&
        page.report_id === null &&
        page.confirmed_uploaded &&
        page.deleted_at === null,
    )
  if (!usable) {
    throw new AppError('VALIDATION_ERROR', { message: 'Some of those pages aren’t ready. Please add them again.' })
  }

  const service = createServiceClient()
  const { data: created, error: insertError } = await service
    .from('reports')
    .insert({ child_id: child.id, source: 'upload', parse_status: 'pending' })
    .select(COLUMNS)
    .single()
  if (insertError) throw new AppError('INTERNAL', { cause: insertError })
  const row = created as ReportRow

  const { error: linkError } = await service.from('uploads').update({ report_id: row.id }).in('id', unique)
  if (linkError) throw new AppError('INTERNAL', { cause: linkError })

  const { jobId } = await enqueueJob({
    userId,
    childId: child.id,
    type: 'parse_report',
    input: { reportId: row.id, childId: child.id },
    dedupeKey: `parse_report:${row.id}`,
  })
  return { report: await toReportDto(supabase, row, child.lexile), jobId }
}

/**
 * The parent has checked the values. Stores them, applies the Lexile to the reading baseline, and starts the
 * gap analysis. Safe to call twice: a confirmed report is never changed (FR-03).
 */
export async function confirmReport(
  supabase: SupabaseClient,
  userId: string,
  reportId: string,
  values: ConfirmedValues,
): Promise<{ report: ReportDto; jobId: string | null }> {
  const { data, error } = await supabase.from('reports').select(COLUMNS).eq('id', reportId).maybeSingle()
  if (error) throw new AppError('INTERNAL', { cause: error })
  if (!data) throw new AppError('NOT_FOUND')
  const existing = data as ReportRow
  const child = await requireChild(supabase, existing.child_id)

  if (existing.confirmed_at) {
    // Already confirmed: return it, and the analysis job if it is still needed.
    const report = await toReportDto(supabase, existing, child.lexile)
    return { report, jobId: report.hasDiagnosis ? null : await ensureDiagnosisJob(userId, child.id, reportId) }
  }

  if (existing.parse_status === 'pending') throw new AppError('NOT_PARSED')
  if (existing.parse_status === 'failed') {
    throw new AppError('CONFLICT', { message: 'That report couldn’t be read. Please enter the values by hand.' })
  }

  assertPlacementMatchesGrade(child.grade, values)

  // Ownership was established above through RLS; the write itself needs the service role because parents
  // cannot write `reports` directly (so validated, screened values are the only way in).
  const { data: updated, error: updateError } = await createServiceClient()
    .from('reports')
    .update({ confirmed_values: values, confirmed_at: new Date().toISOString() })
    .eq('id', reportId)
    .is('confirmed_at', null) // a simultaneous second confirm changes nothing
    .select(COLUMNS)
    .maybeSingle()
  if (updateError) throw new AppError('INTERNAL', { cause: updateError })
  if (!updated) return confirmReport(supabase, userId, reportId, values)

  await applyReadingBaseline(supabase, child, values.lexile)
  await recordUsage({ userId, childId: child.id, event: 'report.confirmed' })
  try {
    await refreshChildProfileCache(child.id)
  } catch (cacheError) {
    // The cache is rebuilt on the next use; never fail a confirmation over it.
    getLogger({}).warn({ err: cacheError }, 'could not refresh the cached child profile')
  }

  const jobId = await ensureDiagnosisJob(userId, child.id, reportId)
  const freshChild = await requireChild(supabase, child.id)
  return { report: await toReportDto(supabase, updated as ReportRow, freshChild.lexile), jobId }
}

/** Starts (or returns) the gap-analysis job for a confirmed report. */
export async function ensureDiagnosisJob(userId: string, childId: string, reportId: string): Promise<string> {
  const { jobId } = await enqueueJob({
    userId,
    childId,
    type: 'diagnose',
    input: { reportId, childId },
    dedupeKey: `diagnose:${reportId}`,
  })
  return jobId
}
