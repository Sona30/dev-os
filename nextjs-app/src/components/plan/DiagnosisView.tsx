import { ConceptGapsTable } from '@/components/plan/ConceptGapsTable'
import { KeyDataCard } from '@/components/plan/KeyDataCard'
import { SkillTag } from '@/components/plan/SkillTag'
import { Alert } from '@/components/ui/Alert'
import { Card } from '@/components/ui/Card'
import type { DiagnosisDto } from '@/lib/diagnosis/types'

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-6">
      <h2 id={id} className="text-h5">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** The gap analysis in the agreed order: Summary, Key Data, Concept Gaps, Strengths, Recommendations, confidence note, Next step. */
export function DiagnosisView({ diagnosis, nickname }: { diagnosis: DiagnosisDto; nickname: string }) {
  const hasLikely = diagnosis.gaps.some((gap) => gap.likely)

  return (
    <div className="flex flex-col gap-10">
      <Section id="summary" title="Summary">
        <p className="max-w-prose text-body text-text-primary">{diagnosis.summary}</p>
      </Section>

      <Section id="key-data" title="Key data">
        <KeyDataCard diagnosis={diagnosis} />
      </Section>

      <Section id="gaps" title="What to practise">
        {diagnosis.gaps.length > 0 ? (
          <ConceptGapsTable gaps={diagnosis.gaps} />
        ) : (
          <Alert tone="success">
            {nickname} looks on track. We’ll build a confidence-and-stretch worksheet to keep skills sharp.
          </Alert>
        )}
        {diagnosis.unmapped.length > 0 ? (
          <Alert tone="info">
            <p className="font-medium">Some things we couldn’t match to a skill</p>
            <p>We left these out of the plan rather than guess:</p>
            <ul className="mt-1 list-disc pl-5">
              {diagnosis.unmapped.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
      </Section>

      {diagnosis.strengths.length > 0 ? (
        <Section id="strengths" title="Strengths">
          <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
            {diagnosis.strengths.map((strength) => (
              <li key={strength.skillId}>
                <Card className="flex flex-col gap-2">
                  <SkillTag skillId={strength.skillId} skillName={strength.skillName} />
                  <p className="text-caption text-text-secondary">{strength.note}</p>
                </Card>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {diagnosis.recommendations.length > 0 ? (
        <Section id="recommendations" title="Recommendations">
          <ul className="m-0 flex max-w-prose list-disc flex-col gap-2 pl-5 text-body text-text-primary">
            {diagnosis.recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section id="confidence-note" title="How sure are we?">
        <p className="max-w-prose text-body text-text-secondary">
          {hasLikely
            ? 'We only had a summary of the result, so skills marked “Likely” are our best reading of it. The first worksheet will check them and we’ll adjust.'
            : 'Because the report showed results by domain, we read these gaps directly from it.'}{' '}
          This is practice support, not an official assessment.
        </p>
      </Section>

      <Section id="next-step" title="Next step">
        <p className="max-w-prose text-body text-text-primary">
          Create a worksheet below that practises these skills, starting with the first one on the list.
        </p>
      </Section>
    </div>
  )
}
