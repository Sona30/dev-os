'use client'

import { Badge } from '@/components/ui/Badge'
import type { DiagnosisGap } from '@/lib/diagnosis/types'

const MAX_SELECTED = 6

interface FocusPickerProps {
  gaps: DiagnosisGap[]
  selected: string[]
  onChange: (selected: string[]) => void
}

/** Choose which skills the worksheet focuses on. The recommended ones (top priorities) start ticked. */
export function FocusPicker({ gaps, selected, onChange }: FocusPickerProps) {
  const domains = Array.from(new Set(gaps.map((gap) => gap.domain)))

  function toggle(skillId: string) {
    if (selected.includes(skillId)) {
      // Keep at least one skill selected.
      if (selected.length > 1) onChange(selected.filter((id) => id !== skillId))
    } else if (selected.length < MAX_SELECTED) {
      onChange([...selected, skillId])
    }
  }

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-1 text-body text-text-primary">What should this worksheet focus on?</legend>
      <p className="text-caption text-text-secondary">
        We’ve ticked the skills we’d start with. You can choose 1 to {MAX_SELECTED}.
      </p>
      {domains.map((domain) => (
        <div key={domain} className="flex flex-col gap-2">
          <p className="text-caption text-text-secondary">{domain}</p>
          {gaps
            .filter((gap) => gap.domain === domain)
            .map((gap) => {
              const checked = selected.includes(gap.skillId)
              const atLimit = !checked && selected.length >= MAX_SELECTED
              const onlyOne = checked && selected.length === 1
              return (
                <label
                  key={gap.skillId}
                  className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-canvas p-3 transition-colors duration-fast ease-enter hover:bg-subtle"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
                    checked={checked}
                    disabled={atLimit || onlyOne}
                    onChange={() => toggle(gap.skillId)}
                  />
                  <span className="flex flex-1 flex-col gap-1">
                    <span className="text-body text-text-primary">{gap.skillName}</span>
                    <span className="flex flex-wrap gap-2">
                      {gap.priority === 1 ? <Badge tone="info">Start here</Badge> : null}
                      {gap.likely ? <Badge tone="accent">Likely</Badge> : null}
                    </span>
                  </span>
                </label>
              )
            })}
        </div>
      ))}
    </fieldset>
  )
}
