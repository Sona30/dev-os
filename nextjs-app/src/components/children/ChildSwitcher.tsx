'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Select } from '@/components/ui/Select'
import type { ChildDto } from '@/lib/children/types'

interface ChildSwitcherProps {
  options: Pick<ChildDto, 'id' | 'nickname'>[]
  currentChildId: string
}

/** Jump to another child while staying in the same section (e.g. Settings). */
export function ChildSwitcher({ options, currentChildId }: ChildSwitcherProps) {
  const router = useRouter()
  const pathname = usePathname()

  if (options.length < 2) return null

  return (
    <div className="w-full max-w-64">
      <label htmlFor="child-switcher" className="sr-only">
        Switch child
      </label>
      <Select
        id="child-switcher"
        value={currentChildId}
        onChange={(event) => {
          const section = pathname.split('/')[3] ?? 'setup'
          router.push(`/children/${event.target.value}/${section}`)
        }}
      >
        {options.map((child) => (
          <option key={child.id} value={child.id}>
            {child.nickname}
          </option>
        ))}
      </Select>
    </div>
  )
}
