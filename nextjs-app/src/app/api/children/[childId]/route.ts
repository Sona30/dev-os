import { accepted, ok } from '@/lib/api/respond'
import { route } from '@/lib/api/route'
import { getChild, requireChild, updateChild } from '@/lib/children/children.service'
import { AppError } from '@/lib/errors/app-error'
import { enqueueJob } from '@/lib/jobs/enqueue'
import { childIdParams, deleteChildSchema, updateChildSchema } from '@/lib/schemas/children'
import { sanitizeForLLM } from '@/lib/security/promptInjectionGuard'

export const dynamic = 'force-dynamic'

export const GET = route(
  { name: 'children.get', auth: 'user', params: childIdParams },
  async ({ supabase, params }) => {
    return ok(await getChild(supabase, params.childId))
  },
)

export const PATCH = route(
  { name: 'children.update', auth: 'user', params: childIdParams, body: updateChildSchema },
  async ({ supabase, params, body }) => {
    // The nickname is sent to the AI with every request about this child.
    const nickname = body.nickname === undefined ? undefined : sanitizeForLLM(body.nickname, 'nickname')
    return ok(await updateChild(supabase, params.childId, { ...body, ...(nickname === undefined ? {} : { nickname }) }))
  },
)

export const DELETE = route(
  {
    name: 'children.delete',
    auth: 'user',
    params: childIdParams,
    body: deleteChildSchema,
    rateLimit: { windowSeconds: 60, max: 5 },
  },
  async ({ user, supabase, params, body, log }) => {
    // Ownership is established here with the user-scoped client; the deletion itself needs the service role.
    const child = await requireChild(supabase, params.childId)
    if (body.confirm !== child.nickname) {
      throw new AppError('VALIDATION_ERROR', {
        message: 'Type the nickname exactly to confirm deleting this profile.',
        details: { fieldErrors: { confirm: ['Type the nickname exactly to confirm.'] } },
      })
    }
    // Deletion runs as a job. The job row has no child_id so it outlives the profile and the browser
    // can still read its final status; dedupe makes a double click return the same job.
    const { jobId } = await enqueueJob({
      userId: user.id,
      childId: null,
      type: 'delete_child',
      input: { childId: child.id },
      dedupeKey: `delete_child:${child.id}`,
    })
    log.info({ jobId }, 'child deletion queued')
    return accepted({ jobId })
  },
)
