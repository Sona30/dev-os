import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors/app-error'
import { assertSameOriginRequest } from '@/lib/security/authGuard'

function request(method: string, headers: Record<string, string>) {
  return new NextRequest('https://testready.example/api/children', { method, headers })
}

function codeOf(fn: () => unknown): string | null {
  try {
    fn()
    return null
  } catch (error) {
    return error instanceof AppError ? error.code : 'NOT_APP_ERROR'
  }
}

describe('assertSameOriginRequest', () => {
  it('allows same-origin JSON writes', () => {
    const req = request('POST', { origin: 'https://testready.example', 'content-type': 'application/json' })
    expect(codeOf(() => assertSameOriginRequest(req, true))).toBeNull()
  })

  it('refuses a cross-site write', () => {
    const req = request('POST', { origin: 'https://evil.example', 'content-type': 'application/json' })
    expect(codeOf(() => assertSameOriginRequest(req, true))).toBe('FORBIDDEN')
  })

  it('refuses a cross-site write without an Origin header', () => {
    const req = request('DELETE', { 'sec-fetch-site': 'cross-site' })
    expect(codeOf(() => assertSameOriginRequest(req, false))).toBe('FORBIDDEN')
  })

  it('refuses a form-encoded body (login CSRF via an HTML form)', () => {
    const req = request('POST', { origin: 'https://testready.example', 'content-type': 'text/plain' })
    expect(codeOf(() => assertSameOriginRequest(req, true))).toBe('UNSUPPORTED_CONTENT_TYPE')
  })

  it('never blocks reads', () => {
    const req = request('GET', { origin: 'https://evil.example' })
    expect(codeOf(() => assertSameOriginRequest(req, false))).toBeNull()
  })
})
