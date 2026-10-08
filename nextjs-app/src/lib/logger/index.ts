import 'server-only'
import { createHash } from 'node:crypto'
import pino, { type Logger } from 'pino'

// Structured JSON logging — docs/specs/14-observability-and-cost.md §1 and 13 §3.
// Child data (nicknames, answers), emails, credentials and signed URLs are redacted wherever they appear.
const REDACTED_KEYS = [
  'nickname',
  'answer',
  'extractedAnswer',
  'email',
  'authorization',
  'cookie',
  'password',
  'token',
  'url',
  // Secrets and links that grant access on their own.
  'access_token',
  'refresh_token',
  'apiKey',
  'api_key',
  'secret',
  'serviceRoleKey',
  'signature',
  'signedUrl',
  'uploadUrl',
]

const redactPaths = [
  ...REDACTED_KEYS,
  ...REDACTED_KEYS.map((key) => `*.${key}`),
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-signature"]',
  'res.headers["set-cookie"]',
]

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { env: process.env.APP_ENV || process.env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: { paths: redactPaths, censor: '[redacted]' },
})

export interface LogContext {
  requestId?: string
  jobId?: string
  route?: string
  userIdHash?: string
}

export function getLogger(context: LogContext = {}): Logger {
  return logger.child(context)
}

/** Stable pseudonym for correlating a user's log lines without storing their id or email. */
export function hashUserId(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 12)
}

export type { Logger }
