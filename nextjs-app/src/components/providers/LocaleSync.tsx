'use client'

import { useEffect } from 'react'
import { apiFetch } from '@/lib/client/api'

const LETTER_REGIONS = new Set(['US', 'CA', 'MX'])

interface LocaleSyncProps {
  /** Profile locale as stored. Only the untouched default ('en-US') is eligible for auto-detection. */
  storedLocale: string
}

/**
 * First-visit paper-size detection (docs/specs/01 §2): if the browser's region is outside
 * US/CA/MX, switch the default to A4 once and record the locale so we never override the parent again.
 */
export function LocaleSync({ storedLocale }: LocaleSyncProps) {
  useEffect(() => {
    if (storedLocale !== 'en-US') return
    const browserLocale = navigator.language
    if (!browserLocale || browserLocale === 'en-US') return

    let region: string | undefined
    try {
      region = new Intl.Locale(browserLocale).region
    } catch {
      return
    }
    if (!region || LETTER_REGIONS.has(region)) return

    apiFetch('/api/me', { method: 'PATCH', body: { paperSize: 'a4', locale: browserLocale.slice(0, 10) } }).catch(
      () => {
        // Best effort: a failure just leaves the Letter default, which the parent can change in Account.
      },
    )
  }, [storedLocale])

  return null
}
