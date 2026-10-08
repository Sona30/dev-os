import { z } from 'zod'
import { buildChildProfile, refreshChildProfileCache } from '@/lib/children/build-child-profile'
import { CALIBRATION_DEFAULTS, clampLevel } from '@/lib/calibration/config'
import { dataConfidenceFor, groundDiagnosis } from '@/lib/diagnosis/grounding'
import { AppError } from '@/lib/errors/app-error'
import { callAgent } from '@/lib/foundry/client'
import { deriveReadingBand } from '@/lib/reading/derive-reading-band'
import { uuid } from '@/lib/schemas/common'
import { confirmedValuesSchema } from '@/lib/schemas/reports'
import { assertCatalogUsable, getCatalog, indexBySkillId, skillsForChild } from '@/lib/skills/catalog'
import type { JobRunner } from '../context'

const inputSchema = z.object({ reportId: uuid, childId: uuid }).passthrough()

/**
 * diagnose: turns the parent-confirmed result into concept gaps grounded in the skills catalogue (FR-04).
 * Code, not the model, decides data confidence and ordering; anything the model cites that is not in the
 * catalogue is reported as "could not match" instead of shown as a skill. Idempotent per report.
 */
export const runDiagnose: JobRunner = async ({ job, service, setProgress, assertChildExists, log }) => {
  const { reportId, childId } = inputSchema.parse(job.input)

  const { data: existing, error: existingError } = await service
    .from('diagnoses')
    .select('id')
    .eq('report_id', reportId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingError) throw new AppError('INTERNAL', { cause: existingError })
  if (existing) return { diagnosisId: (existing as { id: string }).id }

  const { data: reportRow, error: reportError } = await service
    .from('reports')
    .select('id, child_id, confirmed_values, confirmed_at')
    .eq('id', reportId)
    .maybeSingle()
  if (reportError) throw new AppError('INTERNAL', { cause: reportError })
  const report = reportRow as { child_id: string; confirmed_values: unknown; confirmed_at: string | null } | null
  if (!report || report.child_id !== childId) throw new AppError('NOT_FOUND')
  // The server-side gate: a report the parent has not confirmed can never drive a plan.
  if (!report.confirmed_at) throw new AppError('REPORT_NOT_CONFIRMED')
  const values = confirmedValuesSchema.parse(report.confirmed_values)

  const { data: childRow, error: childError } = await service
    .from('children')
    .select('id, user_id, grade, lexile, reading_band, reading_band_estimated')
    .eq('id', childId)
    .maybeSingle()
  if (childError) throw new AppError('INTERNAL', { cause: childError })
  const child = childRow as {
    user_id: string
    grade: 1 | 2
    lexile: number | null
    reading_band: 'R1' | 'R2' | 'R3' | 'R4' | null
  } | null
  if (!child || child.user_id !== job.user_id) throw new AppError('NOT_FOUND')

  await setProgress('reading_profile')
  const catalog = await getCatalog()
  assertCatalogUsable(catalog)
  const allowed = skillsForChild(catalog, child.grade)
  const catalogIndex = indexBySkillId(catalog)
  const confidence = dataConfidenceFor(values)
  const childProfile = await buildChildProfile(service, childId)

  await assertChildExists()
  await setProgress('matching_skills')
  const result = await callAgent({
    mode: 'diagnose',
    input: {
      grade: child.grade,
      score_or_placement: {
        overall_score: values.overallScore,
        placement: values.placement,
        window: values.window,
        domains: values.domainResults,
      },
      lexile: values.lexile,
      catalog: allowed.map((skill) => ({
        skill_id: skill.skillId,
        name: skill.name,
        domain: skill.domain,
        prerequisites: skill.prerequisites,
      })),
      child_profile: childProfile,
    },
    usage: { userId: job.user_id, childId, jobId: job.id },
  })

  await setProgress('ranking')
  if (result.data.dataConfidence !== confidence) {
    log.info({ model: result.data.dataConfidence, code: confidence }, 'data confidence differs; using the rule-based value')
  }
  const grounded = groundDiagnosis(result.data, { allowed, catalog: catalogIndex, confidence })

  const { data: inserted, error: insertError } = await service
    .from('diagnoses')
    .insert({
      child_id: childId,
      report_id: reportId,
      data_confidence: confidence,
      summary: result.data.summary,
      gaps: grounded.gaps,
      strengths: grounded.strengths,
      recommendations: result.data.recommendations,
      unmapped_items: grounded.unmapped,
      kb_version: result.kbVersion,
      prompt_version: result.promptVersion,
      model: result.model,
    })
    .select('id')
    .single()
  if (insertError) throw new AppError('INTERNAL', { cause: insertError })

  // Starting levels for the calibration engine. Existing rows (a previous diagnosis) are never overwritten.
  const baseline = [
    ...grounded.gaps.map((gap) => ({ skill_id: gap.skillId, math_level: clampLevel(gap.suggestedMathLevel) })),
    ...grounded.strengths.map((strength) => ({
      skill_id: strength.skillId,
      math_level: CALIBRATION_DEFAULTS.strengthLevel,
    })),
  ]
  if (baseline.length > 0) {
    const { error: masteryError } = await service.from('skill_mastery').upsert(
      baseline.map((row) => ({ child_id: childId, ...row, status: 'not_enough_evidence' })),
      { onConflict: 'child_id,skill_id', ignoreDuplicates: true },
    )
    if (masteryError) throw new AppError('INTERNAL', { cause: masteryError })
  }

  // A band should already exist from report confirmation; this only fills a gap (never overrides a Lexile).
  if (child.reading_band === null) {
    const band = result.data.estimatedReadingBand ?? deriveReadingBand(child.grade, child.lexile).band
    const { error: bandError } = await service
      .from('children')
      .update({ reading_band: band, reading_band_estimated: child.lexile === null })
      .eq('id', childId)
    if (bandError) throw new AppError('INTERNAL', { cause: bandError })
  }

  try {
    await refreshChildProfileCache(childId)
  } catch (cacheError) {
    log.warn({ err: cacheError }, 'could not refresh the cached child profile')
  }

  return { diagnosisId: (inserted as { id: string }).id }
}
