import { z } from 'zod'
import { ok } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { overrideSkillLevel } from '@/lib/calibration/mastery.service'
import { mathLevel, skillId, uuid } from '@/lib/schemas/common'

export const dynamic = 'force-dynamic'

export const PATCH = route(
  {
    name: 'skills.override',
    auth: 'user',
    params: z.object({ childId: uuid, skillId }),
    body: z.object({ mathLevel }).strict(),
  },
  async ({ supabase, params, body }) => ok(await overrideSkillLevel(supabase, params.childId, params.skillId, body.mathLevel)),
)
