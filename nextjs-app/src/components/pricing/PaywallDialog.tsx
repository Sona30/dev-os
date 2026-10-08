'use client'

import Link from 'next/link'
import { NotifyMeButton } from '@/components/pricing/NotifyMeButton'
import { buttonStyles } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'

interface PaywallDialogProps {
  open: boolean
  onClose: () => void
}

/** Shown when the free worksheet has been used. No payment is taken in the MVP. */
export function PaywallDialog({ open, onClose }: PaywallDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Your free diagnostic is complete"
      description="You’ve used your free worksheet. Everything you’ve made stays available to view and download."
    >
      <div className="flex flex-col gap-4">
        <p className="text-body text-text-secondary">
          Paid plans for more worksheets, grading and progress tracking are coming. Tell us you’re interested and we’ll
          let you know.
        </p>
        <NotifyMeButton />
        <div>
          <Link href="/pricing" className={buttonStyles({ variant: 'ghost' })}>
            See the plans
          </Link>
        </div>
      </div>
    </Dialog>
  )
}
