import { AI_DISCLOSURE } from '@/lib/constants'

/**
 * Shown on every results view and not dismissible (FR-19). The wording comes from the server so no caller
 * can leave it out.
 */
export function DisclosureBanner({ disclosure }: { disclosure: string }) {
  return (
    <aside role="note" className="flex flex-col gap-1 rounded-lg border border-line bg-subtle p-4">
      <p className="text-caption text-text-primary">{disclosure}</p>
      <p className="text-caption text-text-secondary">{AI_DISCLOSURE}</p>
    </aside>
  )
}
