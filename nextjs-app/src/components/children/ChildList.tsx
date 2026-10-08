'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ChildCard } from '@/components/children/ChildCard'
import { ChildForm } from '@/components/children/ChildForm'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { useChildren } from '@/hooks/use-children'
import type { ChildDto } from '@/lib/children/types'

export function ChildList({ initialChildren }: { initialChildren: ChildDto[] }) {
  const { data: children, isError, refetch } = useChildren(initialChildren)
  const [adding, setAdding] = useState(false)

  const addButton = (
    <Button onClick={() => setAdding(true)}>
      <Plus className="h-5 w-5" aria-hidden="true" />
      Add a child
    </Button>
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-h4">Your children</h1>
        {children && children.length > 0 ? addButton : null}
      </div>

      {isError ? (
        <ErrorState
          title="We couldn’t load your children"
          message="Please check your connection and try again."
          onRetry={() => refetch()}
        />
      ) : children && children.length > 0 ? (
        <ul className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {children.map((child) => (
            <li key={child.id}>
              <ChildCard child={child} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="Add your first child"
          description="We only need a first name or nickname and their grade. Then you can enter their i-Ready result and get a practice worksheet."
          action={addButton}
        />
      )}

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a child"
        description="First name or nickname only."
      >
        <ChildForm onCancel={() => setAdding(false)} />
      </Dialog>
    </div>
  )
}
