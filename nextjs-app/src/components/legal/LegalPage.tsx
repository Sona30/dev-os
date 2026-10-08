import Link from 'next/link'
import { Alert } from '@/components/ui/Alert'
import { SupportContact } from '@/components/legal/SupportContact'
import { LEGAL_LAST_UPDATED, type LegalDoc } from '@/lib/legal/content'
import { NON_AFFILIATION } from '@/lib/constants'

/** Shared layout for the privacy, terms and trust pages. Public: no sign-in needed. */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <>
      <header className="border-b border-line bg-canvas">
        <div className="mx-auto flex max-w-3xl items-center px-4 py-4 md:px-8">
          <Link href="/" className="text-h5">
            TestReady
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12 md:px-8 md:py-16">
        <div className="flex flex-col gap-3">
          <h1 className="text-h3 md:text-h2">{doc.title}</h1>
          <p className="text-caption text-text-secondary">Last updated {LEGAL_LAST_UPDATED}</p>
          <p className="max-w-prose text-body text-text-secondary">{doc.intro}</p>
          {doc.draft ? (
            <Alert tone="info">
              This is a plain-language summary of how TestReady works today. It is a draft and will be reviewed by a
              lawyer before public launch.
            </Alert>
          ) : null}
        </div>

        {doc.sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-3">
            <h2 className="text-h5">{section.heading}</h2>
            {section.bullets ? (
              <ul className="m-0 flex max-w-prose list-disc flex-col gap-2 pl-5 text-body text-text-primary">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : null}
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph} className="max-w-prose text-body text-text-primary">
                {paragraph}
              </p>
            ))}
          </section>
        ))}

        <SupportContact />
      </main>

      <footer className="border-t border-line bg-canvas">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-6 md:px-8">
          <p className="text-caption text-text-secondary">{NON_AFFILIATION}</p>
          <nav aria-label="Legal" className="flex gap-4 text-caption">
            <Link href="/privacy" className="underline">Privacy</Link>
            <Link href="/terms" className="underline">Terms</Link>
            <Link href="/trust" className="underline">Trust</Link>
          </nav>
        </div>
      </footer>
    </>
  )
}
