import type { Metadata } from 'next'
import { ChildSettingsForm } from '@/components/children/ChildSettingsForm'
import { DeleteChildDialog } from '@/components/children/DeleteChildDialog'
import { DeleteImagesCard } from '@/components/children/DeleteImagesCard'
import { Card } from '@/components/ui/Card'
import { getChild } from '@/lib/children/children.service'
import { childIdParams } from '@/lib/schemas/children'
import { createServerClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Settings' }
export const dynamic = 'force-dynamic'

export default async function ChildSettingsPage({ params }: { params: { childId: string } }) {
  const { childId } = childIdParams.parse(params)
  const child = await getChild(createServerClient(), childId)

  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <section aria-labelledby="profile-heading" className="flex flex-col gap-6">
        <h2 id="profile-heading" className="text-h5">
          Profile
        </h2>
        <Card>
          <ChildSettingsForm child={child} />
        </Card>
      </section>

      <section aria-labelledby="photos-heading" className="flex flex-col gap-6">
        <h2 id="photos-heading" className="text-h5">
          Photos
        </h2>
        <DeleteImagesCard childId={child.id} nickname={child.nickname} />
      </section>

      <section aria-labelledby="delete-heading" className="flex flex-col gap-6">
        <h2 id="delete-heading" className="text-h5">
          Delete this profile
        </h2>
        <Card className="flex flex-col gap-4 border-danger-border">
          <p className="text-body text-text-secondary">
            Permanently deletes {child.nickname}’s profile, worksheets, uploaded photos and progress. You can do this at
            any time.
          </p>
          <div>
            <DeleteChildDialog childId={child.id} nickname={child.nickname} />
          </div>
        </Card>
      </section>
    </div>
  )
}
