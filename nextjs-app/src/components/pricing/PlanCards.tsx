import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { PLANS } from '@/lib/entitlements/plans'

/** The plans, side by side. Directional pricing (PRD s12); checkout is not available yet. */
export function PlanCards() {
  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
      {PLANS.map((plan) => (
        <li key={plan.tier}>
          <Card className="flex h-full flex-col gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-h5">{plan.name}</h3>
                {plan.comingLater ? <Badge>Later</Badge> : null}
              </div>
              <p className="text-body text-text-primary">{plan.price}</p>
              <p className="text-caption text-text-secondary">{plan.audience}</p>
            </div>
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-caption text-text-secondary">
              {plan.includes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Card>
        </li>
      ))}
    </ul>
  )
}
