import { Camera } from 'lucide-react'

/** How to take a photo we can read. Shown above the camera/file picker. */
export function PhotoTips() {
  return (
    <div className="flex gap-3 rounded-lg border border-line bg-canvas p-4">
      <Camera className="mt-0.5 h-5 w-5 shrink-0 text-text-secondary" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <p className="text-body text-text-primary">For the best photo</p>
        <ul className="m-0 list-disc pl-5 text-caption text-text-secondary">
          <li>Lay the sheet flat and take the photo from straight above.</li>
          <li>Use good light and avoid shadows or glare.</li>
          <li>Fit the whole page in the picture, including the Sheet ID at the top.</li>
          <li>One photo per page. A two-page sheet needs two photos.</li>
        </ul>
      </div>
    </div>
  )
}
