'use client'

import { useEffect, useState } from 'react'

/**
 * A banner for everyone during an incident (an outage, a paused feature). Empty almost always.
 * It checks once per page load; if the check fails the page simply shows no banner.
 */
export function SiteNotice() {
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/site-notice', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { text?: string | null } | null) => {
        if (!cancelled && body?.text) setText(body.text)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  if (!text) return null
  return (
    <div role="status" className="border-b border-warning-border bg-warning-bg px-4 py-3 text-center text-body text-warning-text">
      {text}
    </div>
  )
}
