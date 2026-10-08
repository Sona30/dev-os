import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { GenerateInput } from '@/lib/foundry/schemas/inputs'
import { BAND_RULES, checkReadability } from '@/lib/worksheets/bands'
import { checkItem, emptyUsedKeys, markUsed, type GeneratedItem } from '@/lib/worksheets/checks'
import { evaluateArithmetic } from '@/lib/worksheets/arithmetic'
import { buildPlan } from '@/lib/worksheets/planner'
import type { PlannerSkill } from '@/lib/worksheets/types'
import type { ReadingBand } from '@/lib/schemas/common'
import { ratio } from '../lib/metrics'
import { measured, type SuiteOutput } from '../lib/report'
import { describeError, type Recorder } from '../lib/recorder'

// E3 answer-key correctness and ambiguity, E5 reading-level fit, E6 freshness, E15 content safety.
// Builds real plans with the real planner, asks the real agent to write them, then re-checks the output with code
// that is independent of the model (own arithmetic evaluator, readability rules, denylist).

interface CatalogSkill {
  skillId: string
  grade: number
  domain: string
}

async function loadCatalog(): Promise<CatalogSkill[]> {
  const file = process.env.EVAL_CATALOG ?? path.resolve('tests/fixtures/skills_catalog.dev.json')
  return JSON.parse(await readFile(file, 'utf8')) as CatalogSkill[]
}

const BANDS: ReadingBand[] = ['R1', 'R2', 'R3', 'R4']

export async function runGeneration(recorder: Recorder, options: { children: number; cycles: number }): Promise<SuiteOutput> {
  const catalog = (await loadCatalog()).filter((skill) => skill.grade === 1)
  if (catalog.length < 6) throw new Error('The evaluation catalogue needs at least 6 grade 1 skills.')

  let items = 0
  let integerItems = 0
  let keyCorrect = 0
  let ambiguous = 0
  let inBand = 0
  let repeats = 0
  let unsuitable = 0
  let returned = 0
  let apiErrors = 0
  let cycles = 0
  const failures = { keys: [] as string[], band: [] as string[], fresh: [] as string[], safety: [] as string[], api: [] as string[] }

  for (let child = 0; child < options.children; child++) {
    const band = BANDS[child % BANDS.length] as ReadingBand
    const used = emptyUsedKeys()
    const rotate = (offset: number): PlannerSkill[] =>
      Array.from({ length: 3 }, (_, index) => {
        const skill = catalog[(child + offset + index) % catalog.length] as CatalogSkill
        return {
          skillId: skill.skillId,
          domain: skill.domain,
          mathLevel: 2,
          status: offset === 0 ? ('developing' as const) : ('secure' as const),
          changedLastCycle: false,
        }
      })

    for (let cycle = 1; cycle <= options.cycles; cycle++) {
      cycles++
      const plan = buildPlan({
        gaps: rotate(0),
        nearMastery: rotate(3),
        retest: [],
        readingBand: band,
        readingUpStreak: 0,
        bias: 0,
        cycleNumber: cycle,
      })
      const input: GenerateInput = {
        grade: 1,
        plan: { items: plan.items as unknown as Array<Record<string, unknown>>, bias: plan.bias, cycleNumber: cycle },
        history_summary: [],
        band_constraints: BAND_RULES as unknown as Record<string, unknown>,
        child_profile: {
          child: { nickname: 'Maya', grade: 1 },
          baseline: { overallScore: null, placement: null, window: null, reportDate: null },
          reading: { lexile: null, band, estimated: true, confidence: 'low' },
          skills: [],
          cycles: [],
          flags: [],
        },
      }

      let generated: GeneratedItem[]
      try {
        generated = (await recorder.call({ mode: 'generate', input })).data.items
      } catch (error) {
        apiErrors++
        failures.api.push(`child ${child + 1} cycle ${cycle}: ${describeError(error)}`)
        continue
      }
      returned += generated.length

      for (const item of generated) {
        const planItem = plan.items.find((candidate) => candidate.position === item.position)
        if (!planItem) continue
        items++
        const where = `child ${child + 1} cycle ${cycle} item ${item.position}`

        // E3: recompute the answer ourselves, not through the model.
        if (item.answerType === 'integer') {
          integerItems++
          const computed = item.verification.expression ? evaluateArithmetic(item.verification.expression) : null
          if (computed !== null && computed === Number(item.correctAnswer)) keyCorrect++
          else failures.keys.push(`${where}: key ${item.correctAnswer}, recomputed ${computed ?? 'unevaluable'}`)
        }
        if (item.ambiguous) ambiguous++

        // E5
        const bandReasons = checkReadability(item.questionText, planItem.readingBand, planItem.minimalReading)
        if (bandReasons.length === 0) inBand++
        else failures.band.push(`${where}: ${bandReasons[0]}`)

        // E6 and E15 come from the same checks the app runs.
        const reasons = checkItem(item, planItem, used)
        const repeated = reasons.filter((reason) => reason.includes('used before'))
        if (repeated.length > 0) {
          repeats++
          failures.fresh.push(`${where}: ${repeated[0]}`)
        }
        if (reasons.some((reason) => reason.includes('not suitable'))) {
          unsuitable++
          failures.safety.push(`${where}: ${item.questionText}`)
        }
        if (reasons.length === 0) markUsed(used, item, false)
      }
    }
  }

  return {
    metrics: [
      measured('E3', 'e3_key_correct', 'Answer keys that match an independent recomputation', ratio(keyCorrect, integerItems), integerItems, {
        failures: failures.keys,
      }),
      measured('E3', 'e3_ambiguous', 'Items the agent flagged as ambiguous', ambiguous, items, {
        note: 'Count; a human ambiguity review of the sampled sheets is still required.',
      }),
      measured('E5', 'e5_in_band', 'Items within their reading band', ratio(inBand, items), items, { failures: failures.band }),
      measured('E6', 'e6_repeats', 'Repeated questions, numbers or scenarios', repeats, items, {
        failures: failures.fresh,
        note: `${options.children} children × ${options.cycles} cycles`,
      }),
      measured('E15', 'e15_unsuitable', 'Items with unsuitable content (denylist)', unsuitable, items, {
        failures: failures.safety,
        note: 'The denylist is a floor; an educator spot check of 50 items is still required.',
      }),
    ],
    details: { cycles, returned, apiErrors, apiFailures: failures.api.slice(0, 25) },
  }
}
