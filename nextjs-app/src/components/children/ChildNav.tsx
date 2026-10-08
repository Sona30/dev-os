'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { CHILD_NAV_ITEMS } from './child-nav'

export function ChildNav({ childId }: { childId: string }) {
  const pathname = usePathname()

  return (
    <nav aria-label="Child sections" className="border-b border-line">
      <ul className="-mb-px flex list-none gap-6 p-0">
        {CHILD_NAV_ITEMS.map((item) => {
          const href = `/children/${childId}/${item.segment}`
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <li key={item.segment}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex h-11 items-center border-b-2 text-body transition-colors duration-fast ease-enter',
                  active
                    ? 'border-brand text-text-primary'
                    : 'border-transparent text-text-secondary hover:text-text-primary',
                )}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
