import Link from 'next/link'
import { buttonStyles } from '@/components/ui/Button'

interface PlaceholderPageProps {
  title: string
  description: string
  spec: string
  /** True when rendered inside AppShell, which already provides the <main> landmark. */
  inShell?: boolean
  backHref?: string
  backLabel?: string
}

/** Temporary page body for routes whose feature is built in Stage 4. Remove as each spec is implemented. */
export function PlaceholderPage({ title, description, spec, inShell = false, backHref = '/', backLabel = 'Back to home' }: PlaceholderPageProps) {
  const Container = inShell ? 'div' : 'main'
  const Heading = inShell ? 'h2' : 'h1' // the child layout already owns the page's h1
  return (
    <Container {...(inShell ? {} : { id: 'main' })} className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12 md:py-24">
      <Heading className="text-h4">{title}</Heading>
      <p className="text-body text-text-secondary">{description}</p>
      <p className="text-caption text-text-secondary">Built in Stage 4 from {spec}.</p>
      <div>
        <Link href={backHref} className={buttonStyles({ variant: 'secondary' })}>
          {backLabel}
        </Link>
      </div>
    </Container>
  )
}
