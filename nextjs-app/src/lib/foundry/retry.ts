import { MAX_TRANSPORT_ATTEMPTS, RETRY_DELAYS_MS } from './config'

/** A failure that is worth retrying: rate limits, 5xx, network errors, timeouts. */
export class TransientFoundryError extends Error {
  readonly retryAfterMs?: number
  constructor(message: string, retryAfterMs?: number) {
    super(message)
    this.name = 'TransientFoundryError'
    this.retryAfterMs = retryAfterMs
  }
}

/** The service refused the content (safety filter). Retrying cannot help. */
export class ContentBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ContentBlockedError'
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Delay before attempt N (0-based) with ±20% jitter, never shorter than a server-provided Retry-After. */
export function backoffDelay(attemptIndex: number, retryAfterMs?: number): number {
  const base = RETRY_DELAYS_MS[Math.min(attemptIndex, RETRY_DELAYS_MS.length - 1)] ?? 8000
  const jittered = base * (0.8 + Math.random() * 0.4)
  return Math.max(jittered, retryAfterMs ?? 0)
}

/** Runs `operation` up to 3 times, retrying only TransientFoundryError. */
export async function withTransportRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_TRANSPORT_ATTEMPTS; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (!(error instanceof TransientFoundryError) || attempt === MAX_TRANSPORT_ATTEMPTS - 1) throw error
      await sleep(backoffDelay(attempt, error.retryAfterMs))
    }
  }
  throw lastError
}
