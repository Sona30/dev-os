import { z } from 'zod'
import { getLogger } from '@/lib/logger'
import { runJob } from '@/lib/jobs/run-job'
import { verifyJobSignature } from '@/lib/jobs/sign'

// Netlify Background Function (the "-background" suffix gives it up to 15 minutes; the platform answers
// the caller with 202 immediately). Triggered by lib/jobs/trigger.ts with an HMAC of the job id.

const bodySchema = z.object({ jobId: z.string().uuid() })

export default async function handler(request: Request): Promise<Response> {
  const log = getLogger({ route: 'run-job-background' })

  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let jobId: string
  try {
    jobId = bodySchema.parse(await request.json()).jobId
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  let authorised: boolean
  try {
    authorised = verifyJobSignature(jobId, request.headers.get('x-signature'))
  } catch (error) {
    log.error({ err: error }, 'job signing is not configured')
    return new Response('Server misconfigured', { status: 500 })
  }
  if (!authorised) {
    log.warn({ jobId }, 'rejected background job call with an invalid signature')
    return new Response('Unauthorized', { status: 401 })
  }

  await runJob(jobId)
  return new Response(null, { status: 202 })
}
