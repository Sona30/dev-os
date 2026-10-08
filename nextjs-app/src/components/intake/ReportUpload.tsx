'use client'

import { UploadPanel } from '@/components/uploads/UploadPanel'
import { apiFetch } from '@/lib/client/api'

interface ReportUploadProps {
  childId: string
  onStarted: (result: { reportId: string; jobId: string }) => void
}

/** Upload the i-Ready Math report (PDF or screenshots); reading it starts in the background. */
export function ReportUpload({ childId, onStarted }: ReportUploadProps) {
  return (
    <UploadPanel
      childId={childId}
      kind="report_page"
      accept="image/*,application/pdf"
      dropzoneLabel="Choose the report, or drop it here"
      dropzoneHint="PDF or screenshots, up to 5 pages. A report lets us target exact concepts instead of the whole grade."
      submitLabel="Read my report"
      onUploaded={async (uploadIds) => {
        const result = await apiFetch<{ reportId: string; jobId: string }>(`/api/children/${childId}/reports`, {
          method: 'POST',
          body: { uploadIds },
        })
        onStarted(result)
      }}
    />
  )
}
