import Link from 'next/link'
import { buttonStyles } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { NON_AFFILIATION } from '@/lib/constants'
import { cn } from '@/lib/utils'

// Server Component: no event handlers here; hover/focus states come from component classes.

const steps = [
  {
    title: 'Enter the i-Ready result',
    body: 'Upload the report, or type in the overall score or placement. You confirm what we read before anything is built.',
  },
  {
    title: 'See what to practise',
    body: 'We turn the result into a short list of skills your child is still building, in the order that helps most.',
  },
  {
    title: 'Print a fresh worksheet',
    body: 'Up to 10 word problems, each set to a math level and a reading level. Your child writes on paper — no screen.',
  },
  {
    title: 'Photograph it, we adjust',
    body: 'We read the handwriting, ask you about anything unclear, and set the next sheet at the right level.',
  },
]

export default function HomePage() {
  return (
    <>
      <header className="border-b border-line bg-canvas">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-8">
          <span className="text-h5">TestReady</span>
          <nav aria-label="Account" className="flex items-center gap-2">
            <Link href="/login" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
              Log in
            </Link>
            <Link href="/signup" className={buttonStyles({ size: 'sm' })}>
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-12 md:gap-16 md:px-8 md:py-24">
        <section className="flex max-w-3xl flex-col gap-6">
          <h1 className="text-h3 md:text-h1">Turn an i-Ready score into practice that fits your child</h1>
          <p className="text-body text-text-secondary">
            For parents of 1st and 2nd graders. Fresh word problems built from your child’s own result,
            printed on paper and adjusted after every sheet.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/signup" className={buttonStyles()}>
              Try your first worksheet free
            </Link>
            <Link href="#how-it-works" className={cn(buttonStyles({ variant: 'secondary' }))}>
              See how it works
            </Link>
          </div>
        </section>

        <section id="how-it-works" aria-labelledby="how-heading" className="flex flex-col gap-6">
          <h2 id="how-heading" className="text-h5">
            How it works
          </h2>
          <ol className="grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <li key={step.title}>
                <Card className="flex h-full flex-col gap-2">
                  <span className="text-caption text-text-secondary">Step {index + 1}</span>
                  <h3 className="text-body">{step.title}</h3>
                  <p className="text-caption text-text-secondary">{step.body}</p>
                </Card>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-line bg-canvas">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 md:px-8">
          <p className="text-caption text-text-secondary">
            Practice support, not an official assessment. Ask your child’s teacher for the full picture.
          </p>
          <p className="text-caption text-text-secondary">{NON_AFFILIATION}</p>
          <nav aria-label="Legal" className="flex gap-4 text-caption">
            <Link href="/privacy" className="underline">
              Privacy
            </Link>
            <Link href="/terms" className="underline">
              Terms
            </Link>
            <Link href="/trust" className="underline">
              Trust
            </Link>
          </nav>
        </div>
      </footer>
    </>
  )
}
