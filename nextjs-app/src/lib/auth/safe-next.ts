/**
 * Accepts a post-login redirect target only if it is a same-origin path.
 * Rejects absolute URLs, protocol-relative URLs (//host), backslash tricks and control characters.
 */
export function safeNext(value: string | null | undefined, fallback = '/children'): string {
  if (!value) return fallback
  if (!value.startsWith('/') || value.startsWith('//')) return fallback
  if (value.includes('\\') || /[\u0000-\u001f]/.test(value)) return fallback
  try {
    const parsed = new URL(value, 'http://testready.invalid')
    if (parsed.origin !== 'http://testready.invalid') return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}
