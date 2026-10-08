'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface TabItem {
  value: string
  label: string
}

interface TabsProps {
  /** Unique prefix so tab and panel ids stay unique on the page. */
  idBase: string
  label: string
  tabs: readonly TabItem[]
  value: string
  onChange: (value: string) => void
}

export function tabId(idBase: string, value: string) {
  return `${idBase}-tab-${value}`
}

/** Props for the element that shows the selected tab's content. */
export function tabPanelProps(idBase: string, value: string) {
  return {
    role: 'tabpanel' as const,
    id: `${idBase}-panel-${value}`,
    'aria-labelledby': tabId(idBase, value),
    tabIndex: 0,
  }
}

/** Accessible tab list: arrow keys / Home / End move between tabs, only the selected tab is in the tab order. */
export function Tabs({ idBase, label, tabs, value, onChange }: TabsProps) {
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({})

  function move(to: number) {
    const target = tabs[(to + tabs.length) % tabs.length]
    if (!target) return
    onChange(target.value)
    refs.current[target.value]?.focus()
  }

  return (
    <div role="tablist" aria-label={label} className="flex gap-2 border-b border-line">
      {tabs.map((tab, index) => {
        const selected = tab.value === value
        return (
          <button
            key={tab.value}
            ref={(element) => {
              refs.current[tab.value] = element
            }}
            type="button"
            role="tab"
            id={tabId(idBase, tab.value)}
            aria-selected={selected}
            aria-controls={`${idBase}-panel-${tab.value}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') move(index + 1)
              else if (event.key === 'ArrowLeft') move(index - 1)
              else if (event.key === 'Home') move(0)
              else if (event.key === 'End') move(tabs.length - 1)
              else return
              event.preventDefault()
            }}
            className={cn(
              '-mb-px inline-flex h-11 items-center border-b-2 px-2 text-body transition-colors duration-fast ease-enter',
              selected ? 'border-brand text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
