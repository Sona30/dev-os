import { redirect } from 'next/navigation'

export default function ChildIndexPage({ params }: { params: { childId: string } }) {
  redirect(`/children/${params.childId}/setup`)
}
