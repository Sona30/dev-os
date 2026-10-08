import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { AuthListener } from '@/components/providers/AuthListener'
import { LocaleSync } from '@/components/providers/LocaleSync'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { getCurrentUser } from '@/lib/auth/current-user'
import { getProfile } from '@/lib/auth/profiles.service'
import { createServerClient } from '@/lib/supabase/server'

// Server-side gate for the signed-in area (the middleware is only the first line of defence).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const profile = await getProfile(createServerClient(), user.id)

  return (
    <QueryProvider>
      <AuthListener />
      <LocaleSync storedLocale={profile.locale} />
      <AppShell email={profile.email}>{children}</AppShell>
    </QueryProvider>
  )
}
