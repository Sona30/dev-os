import Link from 'next/link'
import { LogoutButton } from '@/components/layout/LogoutButton'
import { buttonStyles } from '@/components/ui/Button'

/** Signed-in controls for the header: account link, the parent's email (wide screens) and log out. */
export function AccountMenu({ email }: { email: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-64 truncate text-caption text-text-secondary md:inline" title={email}>
        {email}
      </span>
      <Link href="/account" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
        Account
      </Link>
      <LogoutButton />
    </div>
  )
}
