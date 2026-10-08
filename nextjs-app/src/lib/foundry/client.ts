import 'server-only'
import { AGENT_IMAGE_MIME } from '@/lib/constants'
import { AppError } from '@/lib/errors/app-error'
import { getLogger } from '@/lib/logger'
import { assertAgentInputSafe } from '@/lib/security/promptInjectionGuard'
import { assertAgentInputSize } from '@/lib/security/tokenLimiter'
import { recordUsage } from '@/lib/usage/record'
import { MODE_CONFIG } from './config'
import { estimateCostUsd } from './cost'
import { getFoundryEnv, isMockEnabled } from './env'
import { extractJson } from './json-extract'
import { KB_VERSION } from './kb-version.generated'
import { buildMessageParts, correctiveMessage } from './prompt'
import { PROMPT_VERSION } from './prompts.generated'
import { createRestSession } from './rest-session'
import { ContentBlockedError, TransientFoundryError } from './retry'
import { INPUT_SCHEMAS, OUTPUT_SCHEMAS } from './schemas'
import type {
  AgentImage,
  AgentSession,
  FoundryRequest,
  FoundryResult,
  Mode,
  ModeOutputs,
  ToolEvent,
  TurnOptions,
  TurnResult,
} from './types'

// The only door to the AI agent. Everything the model returns is parsed and schema-validated here
// before any other code sees it (docs/specs/05-foundry-integration.md §4).

async function openSession(mode: Mode, input: unknown): Promise<AgentSession> {
  if (isMockEnabled()) {
    const { createMockSession } = await import('./mock-session')
    return createMockSession(mode, input)
  }
  return createRestSession()
}

/** Only PNG/JPEG/WEBP/GIF may reach the model; HEIC is converted in the browser first (FR-02). */
export function assertAgentImages(mode: Mode, images: AgentImage[]): void {
  const { maxImages } = MODE_CONFIG[mode]
  if (images.length > maxImages) {
    throw new AppError('VALIDATION_ERROR', {
      message: maxImages === 0 ? 'This step does not take images.' : `You can attach up to ${maxImages} images.`,
    })
  }
  for (const image of images) {
    if (!(AGENT_IMAGE_MIME as readonly string[]).includes(image.mime)) throw new AppError('UNSUPPORTED_MEDIA')
  }
}

function formatIssues(issues: Array<{ path: Array<string | number>; message: string }>): string {
  return issues
    .slice(0, 10)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ')
}

function resolveModel(mode: Mode): string {
  if (isMockEnabled()) return MODE_CONFIG[mode].deployment === 'grader' ? 'mock-grader' : 'mock-default'
  const env = getFoundryEnv()
  return MODE_CONFIG[mode].deployment === 'grader' ? env.graderDeployment : env.modelDeployment
}

/** Translates anything thrown by the transport into an AppError a parent can be shown. */
function toAppError(error: unknown, log: ReturnType<typeof getLogger>): AppError {
  if (error instanceof AppError) return error
  if (error instanceof TransientFoundryError) {
    log.warn({ err: error }, 'Foundry unavailable after retries')
    return new AppError('AI_UNAVAILABLE', { cause: error })
  }
  if (error instanceof ContentBlockedError) {
    log.warn({ err: error }, 'Foundry blocked the content')
    return new AppError('AI_INVALID_OUTPUT', { cause: error })
  }
  log.error({ err: error }, 'Foundry call failed')
  return new AppError('INTERNAL', { cause: error })
}

/**
 * Runs one mode against the agent and returns schema-validated data.
 * - Input is validated before sending; images are checked.
 * - Transport problems are retried (3 attempts with backoff) inside the session.
 * - Invalid or non-conforming JSON gets exactly one corrective retry in the same conversation, then fails
 *   with AI_INVALID_OUTPUT.
 * - Each turn's tokens and estimated cost are recorded to usage_events when `usage` is supplied.
 */
export async function callAgent<M extends Mode>(request: FoundryRequest<M>): Promise<FoundryResult<M>> {
  const { mode } = request
  const log = getLogger({ route: `foundry.${mode}`, jobId: request.usage?.jobId })
  const config = MODE_CONFIG[mode]
  const startedAt = Date.now()

  const parsedInput = INPUT_SCHEMAS[mode].safeParse(request.input)
  if (!parsedInput.success) {
    throw new AppError('INTERNAL', {
      cause: new Error(`Invalid ${mode} input: ${formatIssues(parsedInput.error.issues)}`),
    })
  }
  // Parent-typed fields are screened for prompt injection and the payload size is capped before any tokens
  // are spent (lib/security). Both throw AppErrors, which fail the job with a parent-safe message.
  assertAgentInputSafe(parsedInput.data)
  assertAgentInputSize(parsedInput.data)
  const images = request.images ?? []
  assertAgentImages(mode, images)

  const options: TurnOptions = {
    temperature: config.temperature,
    maxOutputTokens: Math.min(request.maxOutputTokens ?? config.maxOutputTokens, config.maxOutputTokens),
    tools: config.tools,
    model: resolveModel(mode),
  }

  const totals = { inputTokens: 0, outputTokens: 0, codeInterpreterSessions: 0 }
  const toolEvents: ToolEvent[] = []
  let session: AgentSession | null = null

  async function account(turn: TurnResult): Promise<void> {
    totals.inputTokens += turn.inputTokens
    totals.outputTokens += turn.outputTokens
    totals.codeInterpreterSessions += turn.codeInterpreterSessions
    toolEvents.push(...turn.toolEvents)
    if (request.usage) {
      await recordUsage({
        userId: request.usage.userId,
        childId: request.usage.childId,
        jobId: request.usage.jobId,
        event: `foundry.${mode}`,
        inputTokens: turn.inputTokens,
        outputTokens: turn.outputTokens,
        estCostUsd: estimateCostUsd(turn),
      })
    }
  }

  function interpret(text: string): { ok: true; data: ModeOutputs[M]; narrative: string } | { ok: false; issues: string } {
    const extracted = extractJson(text)
    if (!extracted) return { ok: false, issues: 'No valid JSON block was found.' }
    const validated = OUTPUT_SCHEMAS[mode].safeParse(extracted.json)
    if (!validated.success) return { ok: false, issues: formatIssues(validated.error.issues) }
    return { ok: true, data: validated.data as ModeOutputs[M], narrative: extracted.narrative }
  }

  try {
    session = await openSession(mode, request.input)

    let turn = await session.send(buildMessageParts(mode, parsedInput.data, images), options)
    await account(turn)
    let outcome = interpret(turn.text)

    if (!outcome.ok) {
      log.warn({ issues: outcome.issues }, 'agent output failed validation; asking once for corrected JSON')
      turn = await session.send(correctiveMessage(outcome.issues), options)
      await account(turn)
      outcome = interpret(turn.text)
    }
    if (!outcome.ok) {
      log.error({ issues: outcome.issues }, 'agent output still invalid after the corrective retry')
      throw new AppError('AI_INVALID_OUTPUT', { cause: new Error(outcome.issues) })
    }

    return {
      data: outcome.data,
      narrative: outcome.narrative,
      raw: turn.text,
      usage: { ...totals, estCostUsd: estimateCostUsd(totals) },
      model: turn.model,
      durationMs: Date.now() - startedAt,
      toolEvents,
      promptVersion: PROMPT_VERSION,
      kbVersion: KB_VERSION,
    }
  } catch (error) {
    throw toAppError(error, log)
  } finally {
    await session?.close()
  }
}
