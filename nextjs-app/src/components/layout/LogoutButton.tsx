'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { apiFetch } from '@/lib/client/api'
import { createBrowserClient } from '@/lib/supabase/browser'

export function LogoutButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function logOut() {
    setPending(true)
    try {
      // The server revokes the session and clears the cookies (app/api/auth/logout/route.ts).
      await apiFetch('/api/auth/logout', { method: 'POST' })
    } catch (error) {
      console.error(error)
    }
    try {
      // Drop any in-memory session and tell other open tabs (AuthListener) without a second network call.
      await createBrowserClient().auth.signOut({ scope: 'local' })
    } catch (error) {
      // Continue to the login page regardless; the server-side cookies are already gone.
      console.error(error)
    }
    router.replace('/login')
    router.refresh()
  }

  return (
    <Button variant="ghost" size="sm" onClick={logOut} loading={pending}>
      Log out
    </Button>
  )
}
