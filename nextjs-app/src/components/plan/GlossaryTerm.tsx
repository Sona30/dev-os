const DEFINITIONS = {
  'scale score': 'A number that places your child on the i-Ready scale. It is not a percentage or a grade.',
  placement: 'Where your child’s result sits compared with grade level, for example “Mid Grade 1”.',
  'data confidence': 'How much detail the result gave us. More detail means a more certain plan.',
} as const

export type GlossaryKey = keyof typeof DEFINITIONS

/** Explains jargon on first use. The definition is available on hover, focus and to screen readers. */
export function GlossaryTerm({ term, children }: { term: GlossaryKey; children?: React.ReactNode }) {
  return (
    <abbr title={DEFINITIONS[term]} tabIndex={0} className="cursor-help underline decoration-dotted underline-offset-4">
      {children ?? term}
    </abbr>
  )
}
