import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError } from '@/lib/errors/app-error'
import { childProfileSchema, type ChildProfile } from '@/lib/schemas/child-profile'
import { createServiceClient } from '@/lib/supabase/service'

// The Child Profile is the app-held state sent with every agent call (FR-14).
// Output is deterministic and capped at 6 KB (docs/specs/02 §4.4).

const MAX_PROFILE_BYTES = 6144

interface ReportRow {
  assessment_window: 'BOY' | 'MOY' | 'EOY' | null
  overall_score: number | null
  placement: string | null
  confirmed_at: string | null
}

interface MasteryRow {
  skill_id: string
  math_level: number
  status: 'secure' | 'developing' | 'not_yet' | 'not_enough_evidence'
  evidence_count: number
  last_seen_cycle: number | null
  trend: 'improving' | 'steady' | 'slipping' | null
  retest: boolean
}

interface CycleRow {
  id: string
  cycle_number: number
  summary: string | null
  read_aloud: boolean
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length
}

/** Progressively drops detail until the profile fits: fewer cycles → shorter summaries → no cycles. */
function fitToBudget(profile: ChildProfile): ChildProfile {
  let result = profile
  if (byteLength(result) <= MAX_PROFILE_BYTES) return result

  result = { ...result, cycles: result.cycles.slice(-2) }
  if (byteLength(result) <= MAX_PROFILE_BYTES) return result

  result = {
    ...result,
    cycles: result.cycles.map((cycle) => ({ ...cycle, resultsSummary: cycle.resultsSummary.slice(0, 160) })),
  }
  if (byteLength(result) <= MAX_PROFILE_BYTES) return result

  return { ...result, cycles: [] }
}

/**
 * Builds the Child Profile from stored data. Pass a user-scoped client for request-time reads
 * (RLS applies) or a service client from jobs.
 */
export async function buildChildProfile(supabase: SupabaseClient, childId: string): Promise<ChildProfile> {
  const childResult = await supabase
    .from('children')
    .select('nickname, grade, lexile, reading_band, reading_band_estimated, reading_confidence')
    .eq('id', childId)
    .maybeSingle()
  if (childResult.error) throw new AppError('INTERNAL', { cause: childResult.error })
  if (!childResult.data) throw new AppError('NOT_FOUND')
  const child = childResult.data as {
    nickname: string
    grade: 1 | 2
    lexile: number | null
    reading_band: 'R1' | 'R2' | 'R3' | 'R4' | null
    reading_band_estimated: boolean
    reading_confidence: 'low' | 'med' | 'high'
  }

  const [reportResult, masteryResult, cyclesResult] = await Promise.all([
    supabase
      .from('reports')
      .select('assessment_window, overall_score, placement, confirmed_at')
      .eq('child_id', childId)
      .not('confirmed_at', 'is', null)
      .order('confirmed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('skill_mastery')
      .select('skill_id, math_level, status, evidence_count, last_seen_cycle, trend, retest')
      .eq('child_id', childId)
      .order('skill_id', { ascending: true }),
    supabase
      .from('cycles')
      .select('id, cycle_number, summary, read_aloud')
      .eq('child_id', childId)
      .eq('status', 'complete')
      .order('cycle_number', { ascending: false })
      .limit(4),
  ])
  for (const result of [reportResult, masteryResult, cyclesResult]) {
    if (result.error) throw new AppError('INTERNAL', { cause: result.error })
  }

  const report = reportResult.data as ReportRow | null
  const mastery = (masteryResult.data ?? []) as MasteryRow[]
  const cycles = ((cyclesResult.data ?? []) as CycleRow[]).slice().reverse() // oldest → newest

  const sheetIds = new Map<string, string>()
  const changes = new Map<string, string[]>()
  if (cycles.length > 0) {
    const cycleIds = cycles.map((cycle) => cycle.id)
    const [sheetsResult, eventsResult] = await Promise.all([
      supabase.from('worksheets').select('cycle_id, sheet_id').in('cycle_id', cycleIds).eq('is_current', true),
      supabase
        .from('calibration_events')
        .select('cycle_id, reason')
        .in('cycle_id', cycleIds)
        .order('created_at', { ascending: true }),
    ])
    if (sheetsResult.error) throw new AppError('INTERNAL', { cause: sheetsResult.error })
    if (eventsResult.error) throw new AppError('INTERNAL', { cause: eventsResult.error })
    for (const sheet of (sheetsResult.data ?? []) as { cycle_id: string; sheet_id: string }[]) {
      sheetIds.set(sheet.cycle_id, sheet.sheet_id)
    }
    for (const event of (eventsResult.data ?? []) as { cycle_id: string; reason: string }[]) {
      changes.set(event.cycle_id, [...(changes.get(event.cycle_id) ?? []), event.reason])
    }
  }

  const flags: string[] = []
  if (child.reading_band_estimated) flags.push('reading_estimated')
  const latestCycle = cycles[cycles.length - 1]
  if (latestCycle?.read_aloud) flags.push('read_aloud_last_cycle')
  for (const row of mastery) if (row.retest) flags.push(`skill_retest:${row.skill_id}`)

  const profile: ChildProfile = {
    child: { nickname: child.nickname, grade: child.grade },
    baseline: {
      overallScore: report?.overall_score ?? null,
      placement: report?.placement ?? null,
      window: report?.assessment_window ?? null,
      reportDate: report?.confirmed_at ? report.confirmed_at.slice(0, 10) : null,
    },
    reading: {
      lexile: child.lexile,
      band: child.reading_band,
      estimated: child.reading_band_estimated,
      confidence: child.reading_confidence,
    },
    skills: mastery.map((row) => ({
      skillId: row.skill_id,
      mathLevel: row.math_level,
      status: row.status,
      evidenceCount: row.evidence_count,
      lastSeenCycle: row.last_seen_cycle,
      trend: row.trend,
    })),
    cycles: cycles.map((cycle) => ({
      cycle: cycle.cycle_number,
      sheetId: sheetIds.get(cycle.id) ?? '',
      resultsSummary: cycle.summary ?? '',
      calibrationChanges: changes.get(cycle.id) ?? [],
    })),
    flags,
  }

  return childProfileSchema.parse(fitToBudget(profile))
}

/** Rebuilds and stores `children.profile_summary` (service role). Called after report confirmation and each finalised cycle. */
export async function refreshChildProfileCache(childId: string): Promise<ChildProfile> {
  const service = createServiceClient()
  const profile = await buildChildProfile(service, childId)
  const { error } = await service.from('children').update({ profile_summary: profile }).eq('id', childId)
  if (error) throw new AppError('INTERNAL', { cause: error })
  return profile
}
