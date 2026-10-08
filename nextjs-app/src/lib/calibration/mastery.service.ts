import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireChild } from '@/lib/children/children.service'
import { AppError } from '@/lib/errors/app-error'
import type { MasteryStatus } from '@/lib/schemas/common'
import { getCatalog, skillsForChild } from '@/lib/skills/catalog'
import { createServiceClient } from '@/lib/supabase/service'

export interface SkillMasteryDto {
  skillId: string
  skillName: string
  mathLevel: number
  status: MasteryStatus
  manualOverride: boolean
}

interface Row {
  math_level: number
  status: MasteryStatus
}

/**
 * The parent sets a skill's level by hand. The next recalibration holds that skill once instead of moving it,
 * then resumes (docs/specs/10 §6). Logged as a parent change, separate from anything the rules decided.
 */
export async function overrideSkillLevel(
  supabase: SupabaseClient,
  childId: string,
  skillId: string,
  mathLevel: number,
): Promise<SkillMasteryDto> {
  const child = await requireChild(supabase, childId)

  const skill = skillsForChild(await getCatalog(), child.grade).find((candidate) => candidate.skillId === skillId)
  if (!skill) throw new AppError('NOT_FOUND', { message: 'That skill isn’t part of this child’s plan.' })

  // Changing a level while it is being recalculated would be overwritten, so ask the parent to wait.
  const { count, error: jobError } = await supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('child_id', childId)
    .eq('type', 'recalibrate')
    .in('status', ['queued', 'running'])
  if (jobError) throw new AppError('INTERNAL', { cause: jobError })
  if ((count ?? 0) > 0) {
    throw new AppError('CONFLICT', { message: 'We’re updating levels right now. Please try again in a minute.' })
  }

  const { data, error } = await supabase
    .from('skill_mastery')
    .select('math_level, status')
    .eq('child_id', childId)
    .eq('skill_id', skillId)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', { cause: error })
  const existing = data as Row | null

  if (existing && existing.math_level === mathLevel) {
    return { skillId, skillName: skill.name, mathLevel, status: existing.status, manualOverride: false }
  }

  const service = createServiceClient()
  const { error: upsertError } = await service.from('skill_mastery').upsert(
    {
      child_id: childId,
      skill_id: skillId,
      math_level: mathLevel,
      manual_override: true,
      ...(existing ? {} : { status: 'not_enough_evidence' }),
    },
    { onConflict: 'child_id,skill_id' },
  )
  if (upsertError) throw new AppError('INTERNAL', { cause: upsertError })

  const { error: eventError } = await service.from('calibration_events').insert({
    child_id: childId,
    axis: 'math',
    skill_id: skillId,
    from_level: `M${existing?.math_level ?? '?'}`,
    to_level: `M${mathLevel}`,
    reason: `You set ${skill.name} to level ${mathLevel}.`,
    source: 'parent_override',
  })
  if (eventError) throw new AppError('INTERNAL', { cause: eventError })

  return { skillId, skillName: skill.name, mathLevel, status: existing?.status ?? 'not_enough_evidence', manualOverride: true }
}
