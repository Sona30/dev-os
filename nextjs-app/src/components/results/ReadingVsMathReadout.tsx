import { Card } from '@/components/ui/Card'
import type { MasteryResultDto, ReadingReadoutDto } from '@/lib/results/types'

/** Two short reads side by side: what the sheet suggests about maths, and about reading. */
export function ReadingVsMathReadout({
  readout,
  mastery,
}: {
  readout: ReadingReadoutDto
  mastery: MasteryResultDto[]
}) {
  const secure = mastery.filter((skill) => skill.label === 'secure').length
  const building = mastery.filter((skill) => skill.label === 'developing' || skill.label === 'not_yet').length
  const mathText =
    mastery.length === 0
      ? 'Not enough clear evidence yet to read the maths on its own.'
      : `${secure} ${secure === 1 ? 'skill looks' : 'skills look'} secure and ${building} ${building === 1 ? 'is' : 'are'} still being built.`

  return (
    <section aria-labelledby="readout-heading" className="flex flex-col gap-4">
      <h2 id="readout-heading" className="text-h5">
        Reading and maths
      </h2>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <h3 className="text-body text-text-primary">Maths</h3>
          <p className="text-caption text-text-secondary">{mathText}</p>
        </Card>
        <Card className="flex flex-col gap-2">
          <h3 className="text-body text-text-primary">Reading</h3>
          <p className="text-caption text-text-secondary">{readout.text}</p>
          {readout.band.from !== readout.band.to ? (
            <p className="text-caption text-text-primary">
              Reading level {readout.band.from} → {readout.band.to}
            </p>
          ) : null}
        </Card>
      </div>
    </section>
  )
}
