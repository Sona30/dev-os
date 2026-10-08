'use client'

import { useEffect, useState } from 'react'
import { Alert } from '@/components/ui/Alert'

// Regions where data rules differ from what TestReady is set up for today (docs/specs/13 §5). A soft notice only:
// nobody is blocked.
const OUTSIDE_US_SCOPE = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU',
  'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB', 'IS', 'LI', 'NO', 'CH',
])

export function RegionNotice() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    try {
      const region = new Intl.Locale(navigator.language).region
      setShow(region !== undefined && OUTSIDE_US_SCOPE.has(region))
    } catch {
      setShow(false)
    }
  }, [])

  if (!show) return null
  return (
    <Alert tone="info" className="mb-6">
      TestReady is currently built for families in the United States. You’re welcome to look around, but it may not match
      your child’s curriculum, and our data practices aren’t yet set up for your region.
    </Alert>
  )
}
