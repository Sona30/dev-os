'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/browser'

/** Signing out in one tab sends every other open tab to the login page. */
export function AuthListener() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createBrowserClient()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        router.replace('/login')
        router.refresh()
      }
    })
    return () => subscription.unsubscribe()
  }, [router])

  return null
}
