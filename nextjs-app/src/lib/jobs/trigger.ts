import { getLogger } from '@/lib/logger'
import { runJob } from './run-job'
import { signJobId } from './sign'

// How a queued job starts executing.
//   netlify (production): POST to the background function, which runs for up to 15 minutes.
//   inline (local `next dev`): run in this process, in the background of the request.
// Selected by JOB_EXECUTION_MODE; defaults to inline in development and netlify elsewhere.

type ExecutionMode = 'netlify' | 'inline'

export function executionMode(): ExecutionMode {
  const configured = process.env.JOB_EXECUTION_MODE
  if (configured === 'netlify' || configured === 'inline') return configured
  return process.env.NODE_ENV === 'development' ? 'inline' : 'netlify'
}

function siteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL || process.env.URL
  if (!url) throw new Error('NEXT_PUBLIC_SITE_URL (or Netlify’s URL) is required to start background jobs.')
  return url.replace(/\/$/, '')
}

/**
 * Starts a queued job. Never throws: if the trigger fails the job simply stays `queued`
 * and the reaper re-triggers it within five minutes (docs/specs/04 §8).
 */
export async function triggerJob(jobId: string): Promise<void> {
  const log = getLogger({ jobId })
  try {
    if (executionMode() === 'inline') {
      setTimeout(() => {
        runJob(jobId).catch((error) => log.error({ err: error }, 'inline job crashed'))
      }, 0)
      return
    }

    const response = await fetch(`${siteUrl()}/.netlify/functions/run-job-background`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-signature': signJobId(jobId) },
      body: JSON.stringify({ jobId }),
    })
    if (response.status !== 202) {
      log.error({ status: response.status }, 'background function did not accept the job; it stays queued')
    }
  } catch (error) {
    log.error({ err: error }, 'could not trigger job; it stays queued')
  }
}
