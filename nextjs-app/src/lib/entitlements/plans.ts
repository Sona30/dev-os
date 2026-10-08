// Plans and limits — the single source (docs/specs/12 §1). Prices are directional (PRD s12) and are shown
// on the pricing page; enforcement reads the subscription row, never this file's prices.

export type PlanTier = 'free' | 'season' | 'family' | 'tutor'

export interface PlanInfo {
  tier: PlanTier
  name: string
  price: string
  audience: string
  includes: string[]
  /** Not purchasable in the MVP. */
  comingLater?: boolean
}

export const PLANS: readonly PlanInfo[] = [
  {
    tier: 'free',
    name: 'Free diagnostic',
    price: '$0',
    audience: 'Everyone, to start',
    includes: ['Gap analysis from the report or score', '1 worksheet and answer key', '1 graded photo upload'],
  },
  {
    tier: 'season',
    name: 'Season Pass',
    price: '$29 for 12 weeks',
    audience: 'Getting ready for the next test window',
    includes: ['Up to 12 worksheets for one child', 'Grading and automatic level adjustment', 'Progress dashboard'],
  },
  {
    tier: 'family',
    name: 'Family',
    price: '$9.99 a month, or $79 a year',
    audience: 'An ongoing practice habit, or siblings',
    includes: [
      'Up to 3 children',
      'Up to 12 worksheets per child each month',
      'Grading, level adjustment and full history',
    ],
  },
  {
    tier: 'tutor',
    name: 'Tutor',
    price: '$24.99 a month',
    audience: 'Tutors and homeschool instructors',
    includes: ['Up to 10 children', 'Batch worksheet creation'],
    comingLater: true,
  },
]

export const FREE_CYCLES = 1
export const SEASON_WORKSHEETS = 12
export const SEASON_WEEKS = 12
export const FAMILY_WORKSHEETS_PER_CHILD_PER_MONTH = 12
