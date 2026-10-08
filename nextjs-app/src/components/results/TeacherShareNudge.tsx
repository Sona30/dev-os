'use client'

import { useEffect, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'

/** A gentle, one-time suggestion to share the sheets with the child's teacher. No diagnostic language. */
export function TeacherShareNudge({ childId }: { childId: string }) {
  const storageKey = `tr:teacher-nudge:${childId}`
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(storageKey) !== 'dismissed')
    } catch {
      setVisible(true) // storage blocked: showing it once more is harmless
    }
  }, [storageKey])

  if (!visible) return null
  return (
    <Alert tone="info">
      <p>
        It might help to share these worksheets with your child’s teacher. They see the whole picture and can suggest what
        to focus on in class.
      </p>
      <Button
        variant="secondary"
        size="sm"
        className="mt-2"
        onClick={() => {
          try {
            window.localStorage.setItem(storageKey, 'dismissed')
          } catch {
            // nothing to store; just hide it for this visit
          }
          setVisible(false)
        }}
      >
        Got it
      </Button>
    </Alert>
  )
}
