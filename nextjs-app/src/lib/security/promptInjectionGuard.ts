import { AppError } from '@/lib/errors/app-error'
import { MAX_USER_TEXT_LENGTH } from './tokenLimiter'

// Prompt-injection protection for every piece of parent-typed text that can reach the AI agent
// (child nickname, report placements and domain names). Two layers:
//   1. Route handlers call sanitizeForLLM() on that text before it is stored, so a bad value is refused with
//      400 PROMPT_INJECTION and never reaches the database.
//   2. lib/foundry/client.ts calls assertAgentInputSafe() on the assembled input right before each AI call,
//      which also catches values written by any path that skipped layer 1.
// Text the model reads from photos cannot be screened here; prompts/v1.0/system.md tells the model to treat
// all input and image text as data, never as instructions.

const INJECTION_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'ignore-instructions',
    pattern:
      /\b(ignore|disregard|forget|skip|drop)\b.{0,30}\b(previous|prior|above|earlier|preceding|all|any|your|the|these|those)\b.{0,20}\b(instructions?|rules?|prompts?|directions?|guidelines?|context|messages?)\b/,
  },
  {
    name: 'override-rules',
    pattern: /\b(override|bypass|circumvent|disable|turn off)\b.{0,20}\b(your|the|all|any|safety|system)\b.{0,20}\b(rules?|instructions?|guidelines?|restrictions?|filters?|safeguards?|policy|policies)\b/,
  },
  { name: 'new-instructions', pattern: /\b(new|updated|real|actual|secret)\s+(instructions?|rules|system\s+prompt)\s*[:\-]/ },
  {
    name: 'reveal-prompt',
    pattern:
      /\b(reveal|show|print|display|output|repeat|leak|dump|tell me|give me|what (is|are))\b.{0,30}\b(system|initial|hidden|original|internal|developer)\s+(prompt|instructions?|message|rules)\b/,
  },
  { name: 'print-instructions', pattern: /\b(print|repeat|reveal|show|output|dump)\b.{0,15}\byour\s+(instructions?|prompt|rules|configuration)\b/ },
  { name: 'system-prompt', pattern: /\bsystem\s*prompt\b/ },
  {
    name: 'expose-env',
    pattern: /\b(expose|show|print|reveal|list|dump|output|leak|give)\b.{0,20}\b(env(ironment)?\s*(variables?|vars?)|\.env\b|process\.env)/,
  },
  { name: 'process-env', pattern: /\bprocess\.env\b|\bimport\.meta\.env\b/ },
  {
    name: 'show-secrets',
    pattern: /\b(show|reveal|print|give|leak|expose|send|output|list)\b.{0,25}\b(api[\s_-]?keys?|secret[\s_-]?keys?|access[\s_-]?tokens?|service[\s_-]?role|credentials|passwords?|connection strings?)\b/,
  },
  {
    name: 'database-dump',
    pattern: /\b(dump|export|list|show|select)\b.{0,20}\b(the\s+)?(database|db|tables?|all\s+users|other\s+users)\b/,
  },
  { name: 'you-are-now', pattern: /\byou\s+are\s+now\b/ },
  { name: 'act-as', pattern: /\bact\s+as\s+(a|an|if|my|the)\b/ },
  { name: 'pretend', pattern: /\bpretend\s+(to\s+be|you\s+are|you're|that\s+you)\b/ },
  { name: 'roleplay', pattern: /\b(role[\s-]?play|from now on you)\b/ },
  { name: 'jailbreak', pattern: /\bjail\s*break(ing)?\b/ },
  { name: 'dan-mode', pattern: /\bdan\s+mode\b|\bdo\s+anything\s+now\b/ },
  { name: 'developer-mode', pattern: /\b(developer|dev|debug|god|admin|sudo)\s+mode\b/ },
  {
    name: 'role-markers',
    pattern: /<\|?\s*(im_start|im_end|system|assistant|user)\s*\|?>|\[\/?(inst|system)\]|^\s*#{1,6}\s*(system|instructions?)\b|^\s*(system|assistant)\s*:/m,
  },
]

// Zero-width and bidirectional control characters are used to hide instructions from a human reviewer.
const INVISIBLE_CHARS = /[​-‏‪-‮⁠-⁤⁦-⁩﻿]/g
// C0/C1 control characters other than tab and newline.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g

/** Canonical form used both for storage and for matching (folds full-width letters, removes hidden characters). */
export function normalizeUserText(text: string): string {
  return text.normalize('NFKC').replace(INVISIBLE_CHARS, '').replace(CONTROL_CHARS, '').trim()
}

export interface InjectionCheck {
  detected: boolean
  /** Name of the first pattern that matched (for logs; never shown to the user). */
  pattern?: string
}

export function detectPromptInjection(text: string): InjectionCheck {
  const haystack = normalizeUserText(text).toLowerCase().replace(/\s+/g, ' ')
  for (const { name, pattern } of INJECTION_PATTERNS) {
    if (pattern.test(haystack)) return { detected: true, pattern: name }
  }
  return { detected: false }
}

/**
 * Normalises one piece of parent-typed text bound for the AI and refuses it if it looks like an attempt to
 * steer the model. Returns the normalised text to store/send. Throws 400 PROMPT_INJECTION, or 422
 * VALIDATION_ERROR if it is longer than the absolute ceiling.
 */
export function sanitizeForLLM(text: string, field = 'text'): string {
  const normalized = normalizeUserText(text)
  if (normalized.length > MAX_USER_TEXT_LENGTH) {
    throw new AppError('VALIDATION_ERROR', {
      details: { fieldErrors: { [field]: [`Please use ${MAX_USER_TEXT_LENGTH} characters or fewer`] } },
    })
  }
  const check = detectPromptInjection(normalized)
  if (check.detected) {
    throw new AppError('PROMPT_INJECTION', { details: { field }, cause: new Error(`pattern ${check.pattern}`) })
  }
  return normalized
}

/** sanitizeForLLM over several optional fields at once (null/undefined are passed through). */
export function sanitizeFieldsForLLM<T extends Record<string, string | null | undefined>>(fields: T): T {
  const out: Record<string, string | null | undefined> = {}
  for (const [field, value] of Object.entries(fields)) {
    out[field] = typeof value === 'string' ? sanitizeForLLM(value, field) : value
  }
  return out as T
}

function get(value: unknown, key: string): unknown {
  return value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
}

/**
 * The strings in an agent input that a parent typed (as opposed to app-generated text such as catalogue
 * skill names or generated questions, which must not be screened — a word problem may legitimately say
 * "pretend you are at a shop").
 */
export function userSuppliedAgentStrings(input: unknown): Array<{ path: string; value: string }> {
  const found: Array<{ path: string; value: string }> = []
  const add = (path: string, value: unknown) => {
    if (typeof value === 'string' && value.length > 0) found.push({ path, value })
  }

  add('child_nickname', get(input, 'child_nickname'))

  const profile = get(input, 'child_profile')
  add('child_profile.child.nickname', get(get(profile, 'child'), 'nickname'))
  add('child_profile.baseline.placement', get(get(profile, 'baseline'), 'placement'))

  const score = get(input, 'score_or_placement')
  add('score_or_placement.placement', get(score, 'placement'))
  const domains = get(score, 'domains')
  if (Array.isArray(domains)) {
    domains.forEach((domain, index) => {
      add(`score_or_placement.domains.${index}.domain`, get(domain, 'domain'))
      add(`score_or_placement.domains.${index}.placement`, get(domain, 'placement'))
    })
  }
  return found
}

/** Last line of defence before an AI call: refuses the call if any parent-typed field carries an injection. */
export function assertAgentInputSafe(input: unknown): void {
  for (const { path, value } of userSuppliedAgentStrings(input)) {
    const check = detectPromptInjection(value)
    if (check.detected) {
      throw new AppError('PROMPT_INJECTION', { details: { field: path }, cause: new Error(`pattern ${check.pattern}`) })
    }
  }
}
