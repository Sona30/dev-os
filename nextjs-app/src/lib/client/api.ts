// Browser-side fetch wrapper. Parses the shared error envelope (docs/specs/00 §5) into ApiError
// and sends the signed-out user to the login page, remembering where they were.

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

const GENERIC_MESSAGE = 'Something went wrong. Please try again.'

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options

  let response: Response
  try {
    response = await fetch(path, {
      method,
      signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, 'NETWORK', "We couldn't reach the server. Check your connection and try again.")
  }

  if (response.status === 204) return undefined as T

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const envelope = payload as { error?: { code?: string; message?: string; details?: unknown } } | null
    const error = new ApiError(
      response.status,
      envelope?.error?.code ?? 'INTERNAL',
      envelope?.error?.message ?? GENERIC_MESSAGE,
      envelope?.error?.details,
    )
    // 401 from the auth endpoints themselves means "wrong email or password", not "session expired".
    if (response.status === 401 && typeof window !== 'undefined' && !path.startsWith('/api/auth/')) {
      const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`)
      window.location.assign(`/login?next=${next}`)
    }
    throw error
  }

  return payload as T
}

/** Returns the field errors from a VALIDATION_ERROR response, if any. */
export function getFieldErrors(error: unknown): Record<string, string[]> {
  if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
    const details = error.details as { fieldErrors?: Record<string, string[]> } | undefined
    return details?.fieldErrors ?? {}
  }
  return {}
}
