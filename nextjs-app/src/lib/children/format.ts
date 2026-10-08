import type { Grade } from '@/lib/schemas/common'

export function gradeLabel(grade: Grade): string {
  return grade === 1 ? '1st grade' : '2nd grade'
}

export function cycleLabel(currentCycle: number): string {
  return currentCycle === 0 ? 'New' : `Cycle ${currentCycle}`
}
