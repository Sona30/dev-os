'use client'

import { ManualScoreForm } from '@/components/intake/ManualScoreForm'
import { ReportUpload } from '@/components/intake/ReportUpload'
import { Tabs, tabPanelProps, type TabItem } from '@/components/ui/Tabs'
import type { ReportDto } from '@/lib/reports/types'
import type { Grade } from '@/lib/schemas/common'

export type InputTab = 'upload' | 'manual'

const TABS: readonly TabItem[] = [
  { value: 'upload', label: 'Upload report' },
  { value: 'manual', label: 'Enter score or placement' },
]

interface ResultInputProps {
  childId: string
  grade: Grade
  tab: InputTab
  onTabChange: (tab: InputTab) => void
  onUploadStarted: (result: { reportId: string; jobId: string }) => void
  onManualCreated: (report: ReportDto) => void
}

export function ResultInput({ childId, grade, tab, onTabChange, onUploadStarted, onManualCreated }: ResultInputProps) {
  return (
    <div className="flex flex-col gap-6">
      <Tabs
        idBase="result-input"
        label="How would you like to enter the result?"
        tabs={TABS}
        value={tab}
        onChange={(value) => onTabChange(value as InputTab)}
      />
      <div {...tabPanelProps('result-input', tab)}>
        {tab === 'upload' ? (
          <ReportUpload childId={childId} onStarted={onUploadStarted} />
        ) : (
          <ManualScoreForm childId={childId} grade={grade} onCreated={onManualCreated} />
        )}
      </div>
    </div>
  )
}
