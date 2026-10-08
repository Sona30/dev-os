// Sections of the per-child area. Later features add their entries here (plan, results, progress).
export interface ChildNavItem {
  segment: string
  label: string
}

export const CHILD_NAV_ITEMS: readonly ChildNavItem[] = [
  { segment: 'setup', label: 'Set up' },
  { segment: 'plan', label: 'Gap analysis' },
  { segment: 'results', label: 'Results' },
  { segment: 'progress', label: 'Progress' },
  { segment: 'settings', label: 'Settings' },
]
