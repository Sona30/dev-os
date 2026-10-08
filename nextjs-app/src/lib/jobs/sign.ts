import { createHmac, timingSafeEqual } from 'node:crypto'

// HMAC over the job id authenticates calls to the background function (docs/specs/04 §3).
// Without the secret nobody can make the function run jobs.

function secret(): string {
  const value = process.env.JOB_SIGNING_SECRET
  if (!value || value.length < 32) {
    throw new Error('JOB_SIGNING_SECRET must be set to a random value of at least 32 characters.')
  }
  return value
}

export function signJobId(jobId: string): string {
  return createHmac('sha256', secret()).update(jobId).digest('hex')
}

export function verifyJobSignature(jobId: string, signature: string | null): boolean {
  if (!signature) return false
  const expected = Buffer.from(signJobId(jobId), 'utf8')
  const received = Buffer.from(signature, 'utf8')
  if (expected.length !== received.length) return false
  return timingSafeEqual(expected, received)
}
