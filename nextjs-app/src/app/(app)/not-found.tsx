import Link from 'next/link'
import { buttonStyles } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'

export default function AppNotFound() {
  return (
    <EmptyState
      title="We couldn’t find that"
      description="The profile may have been deleted, or the link may be wrong."
      action={
        <Link href="/children" className={buttonStyles()}>
          Back to your children
        </Link>
      }
    />
  )
}
