import { ApiError, apiFetch } from './api'

/** Messages shared by the auth forms. */
export const AUTH_MESSAGES = {
  generic: "We couldn't complete that right now. Please try again.",
  unavailable: 'Sign-in is temporarily unavailable. Please try again soon.',
  invalidCredentials: 'Email or password is incorrect.',
} as const

/** Base URL used in email links. Falls back to the current origin when NEXT_PUBLIC_SITE_URL is unset. */
export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
}

/** Counts this attempt against the per-IP limiter. Throws ApiError(RATE_LIMITED) when over the limit. */
export async function precheckAuthAttempt(): Promise<void> {
  try {
    await apiFetch('/api/auth/precheck', { method: 'POST' })
  } catch (error) {
    // If the limiter endpoint itself is unreachable we do not block the parent from signing in.
    if (error instanceof ApiError && error.code === 'RATE_LIMITED') throw error
  }
}

export function messageFromError(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return AUTH_MESSAGES.generic
}
