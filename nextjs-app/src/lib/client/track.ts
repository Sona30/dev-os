import type { ClientEvent } from '@/lib/schemas/events'

/**
 * Sends a product event ("the parent printed a worksheet") so we can see where families get stuck.
 * Fire and forget: it never blocks the page and never shows an error. `keepalive` lets it finish even if the
 * click opens a new tab or the page navigates away.
 */
export function track(event: ClientEvent, options: { childId?: string; component?: string } = {}): void {
  try {
    void fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, ...options }),
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => undefined)
  } catch {
    // Telemetry must never break the page.
  }
}

/** Reports that part of the app crashed. Only the component name is sent, never page content. */
export function reportClientError(component: string): void {
  track('client.error', { component: component.replace(/[^A-Za-z0-9_.-]/g, '-').slice(0, 60) })
}
