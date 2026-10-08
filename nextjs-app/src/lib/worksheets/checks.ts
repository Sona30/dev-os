import type { GenerateOutput } from '@/lib/foundry/schemas/outputs'
import { evaluateArithmetic } from './arithmetic'
import { checkReadability } from './bands'
import {
  contextStructureKey,
  numberAppearsInText,
  numberSetKey,
  questionHash,
  words,
} from './text'
import type { PlanItem } from './types'

// The checks every generated item must pass before it can reach a parent (FR-07, FR-08, FR-05;
// docs/specs/08 §4.3). Each check returns human-readable reasons, which are also fed back to the model
// when an item is rewritten. An item with any reason is never shipped.

export type GeneratedItem = GenerateOutput['items'][number]

/** Everything already used: keys from the child's last four cycles, plus items accepted earlier on this sheet. */
export interface UsedKeys {
  hashes: Set<string>
  numberSets: Set<string>
  contextStructures: Set<string>
}

export function emptyUsedKeys(): UsedKeys {
  return { hashes: new Set(), numberSets: new Set(), contextStructures: new Set() }
}

export function keysOf(item: Pick<GeneratedItem, 'questionText' | 'numberSet' | 'context' | 'structure'>) {
  return {
    hash: questionHash(item.questionText),
    numberSet: numberSetKey(item.numberSet),
    contextStructure: contextStructureKey(item.context, item.structure),
  }
}

const HEDGE_WORDS = /\b(about|around|roughly|approximately|maybe|nearly|almost)\b/i

// Anything a young child's sheet should never contain: violence, fear, weapons, substances, brands.
const UNSUITABLE = new RegExp(
  '\\b(' +
    [
      'kill', 'killed', 'dead', 'death', 'die', 'dies', 'blood', 'gun', 'guns', 'knife', 'knives', 'weapon',
      'bomb', 'war', 'fight', 'fights', 'hurt', 'scary', 'ghost', 'monster', 'beer', 'wine', 'alcohol',
      'cigarette', 'drug', 'drugs', 'gamble', 'casino', 'lottery', 'coca-cola', 'pepsi', 'mcdonald', 'nike',
      'disney', 'pokemon', 'minecraft', 'fortnite',
    ].join('|') +
    ')\\b',
  'i',
)

function leaksAnswer(item: GeneratedItem): boolean {
  if (item.answerType !== 'integer') return false
  const answer = Number(item.correctAnswer)
  // The answer may legitimately appear if it is also one of the numbers in the problem (for example "10 + 0").
  if (item.numberSet.includes(answer)) return false
  return words(item.questionText).some((word) => word === String(answer))
}

/** Checks a single item against the plan, readability rules and freshness. Returns reasons (empty = acceptable). */
export function checkItem(item: GeneratedItem, plan: PlanItem, used: UsedKeys): string[] {
  const reasons: string[] = []

  // 1. The model may not change what the planner decided.
  if (item.skillId !== plan.skillId) reasons.push(`Used skill ${item.skillId}; the plan requires ${plan.skillId}.`)
  if (item.mathLevel !== plan.mathLevel) reasons.push(`Used math level ${item.mathLevel}; the plan requires ${plan.mathLevel}.`)
  if (item.readingBand !== plan.readingBand) {
    reasons.push(`Used reading band ${item.readingBand}; the plan requires ${plan.readingBand}.`)
  }
  if ((item.pairId ?? null) !== plan.pairId) reasons.push('The pair id does not match the plan.')
  if (item.isStretch !== (plan.role === 'stretch')) reasons.push('The stretch flag does not match the plan.')
  if (item.isReadingProbe !== (plan.role === 'reading_probe')) reasons.push('The reading-probe flag does not match the plan.')

  // 2. Verification, layer 1: the agent's own Code Interpreter run.
  if (!item.verification.passed) reasons.push('The answer did not pass verification.')
  if (item.answerType === 'integer' && item.verification.method !== 'code_interpreter') {
    reasons.push('A numeric answer must be verified with Code Interpreter.')
  }

  // 3. Verification, layer 2: our own recomputation, independent of the model.
  if (item.answerType === 'integer') {
    if (!/^\d+$/.test(item.correctAnswer)) {
      reasons.push('A numeric answer must be a whole number.')
    } else if (!item.verification.expression) {
      reasons.push('A numeric answer needs a verification expression.')
    } else {
      const computed = evaluateArithmetic(item.verification.expression)
      if (computed === null) reasons.push('The verification expression could not be evaluated.')
      else if (computed !== Number(item.correctAnswer)) {
        reasons.push(`The expression evaluates to ${computed}, not ${item.correctAnswer}.`)
      }
    }
  }

  // 4. One defensible answer, no tricks.
  if (item.ambiguous) reasons.push('The item was flagged as ambiguous.')
  const questionMarks = (item.questionText.match(/\?/g) ?? []).length
  if (questionMarks !== 1) reasons.push('The problem must ask exactly one question.')
  if (HEDGE_WORDS.test(item.questionText)) reasons.push('Avoid vague words such as "about" or "around".')
  if (item.correctAnswer.trim() === '') reasons.push('The correct answer is empty.')

  // 5. The numbers in numberSet must be the numbers in the problem; the problem must not give the answer away.
  if (item.numberSet.length === 0) reasons.push('List the numbers used in the problem.')
  const missing = item.numberSet.find((value) => !numberAppearsInText(value, item.questionText))
  if (missing !== undefined) reasons.push(`The number ${missing} is in numberSet but not in the problem.`)
  if (leaksAnswer(item)) reasons.push('The problem text contains the answer.')

  // 6. Reading level and suitability.
  reasons.push(...checkReadability(item.questionText, plan.readingBand, plan.minimalReading))
  if (UNSUITABLE.test(item.questionText) || UNSUITABLE.test(item.context)) {
    reasons.push('The scenario is not suitable for young children.')
  }

  // 7. Freshness: nothing repeated from the last four cycles or earlier on this sheet.
  const keys = keysOf(item)
  if (used.hashes.has(keys.hash)) reasons.push('This question was used before.')
  if (used.numberSets.has(keys.numberSet)) reasons.push('These numbers were used before.')
  if (used.contextStructures.has(keys.contextStructure)) reasons.push('This scenario and structure were used before.')

  return reasons
}

export function markUsed(used: UsedKeys, item: GeneratedItem, includeContextStructure: boolean): void {
  const keys = keysOf(item)
  used.hashes.add(keys.hash)
  used.numberSets.add(keys.numberSet)
  // Within one sheet, the same scenario may legitimately appear twice (the two halves of a diagnostic pair).
  if (includeContextStructure) used.contextStructures.add(keys.contextStructure)
}
