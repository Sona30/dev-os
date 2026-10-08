import { ERROR_CATALOG, type ErrorCode } from './codes'

interface AppErrorOptions {
  /** Overrides the catalogue message (e.g. to include a number). */
  message?: string
  /** Machine-readable detail returned to the client (field errors, retry-after, ...). */
  details?: unknown
  cause?: unknown
}

/** An expected, user-presentable failure. Anything else thrown in a handler becomes INTERNAL. */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly userMessage: string
  readonly details?: unknown

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    super(code, options.cause ? { cause: options.cause } : undefined)
    this.name = 'AppError'
    this.code = code
    this.status = ERROR_CATALOG[code].status
    this.userMessage = options.message ?? ERROR_CATALOG[code].message
    this.details = options.details
  }
}

export interface ErrorEnvelope {
  error: { code: ErrorCode; message: string; details?: unknown }
}

export function toEnvelope(error: AppError): ErrorEnvelope {
  return {
    error: {
      code: error.code,
      message: error.userMessage,
      ...(error.details !== undefined ? { details: error.details } : {}),
    },
  }
}
