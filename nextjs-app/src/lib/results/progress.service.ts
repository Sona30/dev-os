import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireChild } from '@/lib/children/children.service'
import { AppError } from '@/lib/errors/app-error'
import type { MasteryStatus, ReadingBand } from '@/lib/schemas/common'
import { DOMAINS } from '@/lib/skills/catalog-schema'
import { getCatalog, indexBySkillId } from '@/lib/skills/catalog'
import { readSnapshot } from './results.service'
import type { ChangeDto, DomainTrendDto, ProgressDto, SkillProgressDto, Trend } from './types'

// Progress across worksheets: per-domain trend, per-skill history, and a plain reason for every change
// (docs/specs/11 §3-4). Built entirely from stored snapshots and logs, so no model is involved.

const SCORE: Record<string, number> = { secure: 2, developing: 1, not_yet: 0 }
const MAX_CHANGES = 50

interface CycleRow {
  id: string
  cycle_number: number
  completed_at: string | null
  focus: unknown
}

function trendBetween(previous: number, latest: number): Trend {
  return latest > previous ? 'improving' : latest < previous ? 'slipping' : 'steady'
}

export async function getProgress(supabase: SupabaseClient, childId: string): Promise<ProgressDto> {
  const child = await requireChild(supabase, childId)
  const catalog = indexBySkillId(await getCatalog())

  const { data: cycleRows, error: cycleError } = await supabase
    .from('cycles')
    .select('id, cycle_number, completed_at, focus')
    .eq('child_id', childId)
    .eq('status', 'complete')
    .order('cycle_number', { ascending: true })
  if (cycleError) throw new AppError('INTERNAL', { cause: cycleError })
  const cycles = (cycleRows ?? []) as CycleRow[]
  const snapshots = cycles.map((cycle) => ({ cycle, results: readSnapshot(cycle.focus).results }))

  // ---- Domain trends: the average label of the skills practised each cycle ----
  const byDomain = new Map<string, DomainTrendDto['points']>()
  for (const { cycle, results } of snapshots) {
    const scores = new Map<string, number[]>()
    for (const skill of results?.skillResults ?? []) {
      const domain = catalog.get(skill.skillId)?.domain
      const score = SCORE[skill.label]
      if (domain === undefined || score === undefined) continue // "not enough evidence" is not a data point
      scores.set(domain, [...(scores.get(domain) ?? []), score])
    }
    for (const [domain, values] of Array.from(scores.entries())) {
      byDomain.set(domain, [
        ...(byDomain.get(domain) ?? []),
        {
          cycle: cycle.cycle_number,
          date: cycle.completed_at,
          score: Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100,
          skillsCovered: values.length,
        },
      ])
    }
  }
  const domains: DomainTrendDto[] = DOMAINS.filter((domain) => byDomain.has(domain)).map((domain) => {
    const points = byDomain.get(domain) ?? []
    const last = points[points.length - 1]
    const before = points[points.length - 2]
    return {
      domain,
      points,
      latestTrend: last && before ? trendBetween(before.score, last.score) : null,
    }
  })

  // ---- Skills: current level and what happened to it, sheet by sheet ----
  const { data: masteryRows, error: masteryError } = await supabase
    .from('skill_mastery')
    .select('skill_id, math_level, status, trend')
    .eq('child_id', childId)
  if (masteryError) throw new AppError('INTERNAL', { cause: masteryError })

  const skills: SkillProgressDto[] = []
  for (const row of (masteryRows ?? []) as Array<{ skill_id: string; math_level: number; status: MasteryStatus; trend: Trend }>) {
    const meta = catalog.get(row.skill_id)
    if (!meta) continue
    // Walk back from today's level, undoing each recorded level change, to know the level after every sheet.
    let running = row.math_level
    const history: SkillProgressDto['history'] = []
    for (const { cycle, results } of [...snapshots].reverse()) {
      const result = results?.skillResults.find((entry) => entry.skillId === row.skill_id)
      if (!result) continue
      history.push({ cycle: cycle.cycle_number, label: result.label, level: running })
      if (result.levelChange) running = result.levelChange.from
    }
    skills.push({
      skillId: row.skill_id,
      name: meta.name,
      domain: meta.domain,
      currentLevel: row.math_level,
      status: row.status,
      trend: row.trend,
      history: history.reverse(),
    })
  }
  skills.sort((a, b) => a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name))

  // ---- Why things changed ----
  const { data: eventRows, error: eventError } = await supabase
    .from('calibration_events')
    .select('created_at, axis, reason, cycles(cycle_number)')
    .eq('child_id', childId)
    .order('created_at', { ascending: false })
    .limit(MAX_CHANGES)
  if (eventError) throw new AppError('INTERNAL', { cause: eventError })
  type EventRow = {
    created_at: string
    axis: 'math' | 'reading'
    reason: string
    cycles: { cycle_number: number } | Array<{ cycle_number: number }> | null
  }
  const changes: ChangeDto[] = ((eventRows ?? []) as unknown as EventRow[]).map((row) => {
    const cycleRef = Array.isArray(row.cycles) ? row.cycles[0] : row.cycles
    return { date: row.created_at, cycle: cycleRef?.cycle_number ?? null, axis: row.axis, text: row.reason }
  })

  // ---- Reading level over time (the points where it changed) ----
  const { data: readingRows, error: readingError } = await supabase
    .from('calibration_events')
    .select('to_level, cycles(cycle_number)')
    .eq('child_id', childId)
    .eq('axis', 'reading')
    .order('created_at', { ascending: true })
  if (readingError) throw new AppError('INTERNAL', { cause: readingError })
  const readingHistory = ((readingRows ?? []) as unknown as Array<{
    to_level: string
    cycles: { cycle_number: number } | Array<{ cycle_number: number }> | null
  }>).map((row) => {
    const cycleRef = Array.isArray(row.cycles) ? row.cycles[0] : row.cycles
    return { cycle: cycleRef?.cycle_number ?? 0, band: row.to_level }
  })

  // ---- Where we started ----
  const { data: report, error: reportError } = await supabase
    .from('reports')
    .select('assessment_window, overall_score, placement, confirmed_at')
    .eq('child_id', childId)
    .not('confirmed_at', 'is', null)
    .order('confirmed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (reportError) throw new AppError('INTERNAL', { cause: reportError })
  const baseline = report as {
    assessment_window: 'BOY' | 'MOY' | 'EOY' | null
    overall_score: number | null
    placement: string | null
    confirmed_at: string
  } | null

  return {
    baseline: baseline
      ? {
          window: baseline.assessment_window,
          overallScore: baseline.overall_score,
          placement: baseline.placement,
          date: baseline.confirmed_at,
        }
      : null,
    domains,
    skills,
    changes,
    reading: {
      band: child.reading_band as ReadingBand | null,
      estimated: child.reading_band_estimated,
      confidence: child.reading_confidence,
      history: readingHistory,
    },
    completedCycles: cycles.length,
  }
}
