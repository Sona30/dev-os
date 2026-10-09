import { DefaultAzureCredential } from '@azure/identity'
import { getFoundryEnv, type FoundryEnv } from './env'
import { ContentBlockedError, TransientFoundryError, withTransportRetry } from './retry'
import type { AgentSession, MessagePart, ToolEvent, TurnOptions, TurnResult } from './types'

// Talks to an Azure AI Foundry agent through the Responses API on the project endpoint:
//   POST {project endpoint}/openai/v1/responses   with   agent_reference: { name, type: "agent_reference" }
// The agent owns its model, instructions (prompts/v1.0/system.md), tools and knowledge base, which are set in the
// Foundry portal; a request that names an agent must not try to override them, so only `input` is sent.
// Each session keeps its own message history and resends it, so nothing depends on server-side conversation state.

const TOKEN_SCOPE = 'https://ai.azure.com/.default'
const POLL_INTERVAL_MS = 1000

let credential: DefaultAzureCredential | null = null

async function authorizationHeader(): Promise<string> {
  credential ??= new DefaultAzureCredential()
  const token = await credential.getToken(TOKEN_SCOPE)
  if (!token) throw new Error('Could not obtain an Azure access token. Check the AZURE_* settings or run `az login`.')
  return `Bearer ${token.token}`
}

interface OutputItem {
  type: string
  status?: string
  role?: string
  content?: Array<{ type: string; text?: string }>
}

interface ResponseObject {
  id: string
  status: string
  model?: string
  output?: OutputItem[]
  usage?: { input_tokens?: number; output_tokens?: number } | null
  error?: { code?: string; message?: string } | null
  incomplete_details?: { reason?: string } | null
}

type InputContent = { type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'high' }
type InputMessage = { role: 'user'; content: InputContent[] } | { role: 'assistant'; content: string }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get('retry-after')
  const seconds = header ? Number(header) : NaN
  return Number.isFinite(seconds) ? seconds * 1000 : undefined
}

function replyText(response: ResponseObject): string {
  return (response.output ?? [])
    .filter((item) => item.type === 'message' && item.role !== 'user')
    .flatMap((item) => item.content ?? [])
    .filter((block) => block.type === 'output_text')
    .map((block) => block.text ?? '')
    .join('\n')
    .trim()
}

function toolEventsOf(response: ResponseObject): ToolEvent[] {
  return (response.output ?? [])
    .filter((item) => item.type.endsWith('_call'))
    .map((item) => ({ tool: item.type.replace(/_call$/, ''), status: item.status ?? 'unknown' }))
}

class RestSession implements AgentSession {
  private readonly history: InputMessage[] = []

  constructor(private readonly env: FoundryEnv) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.env.timeoutMs)

    let response: Response
    try {
      response = await fetch(`${this.env.endpoint}${path}`, {
        method,
        headers: { Authorization: await authorizationHeader(), 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError' || error instanceof TypeError) {
        throw new TransientFoundryError('Network error or timeout calling Foundry')
      }
      throw error
    } finally {
      clearTimeout(timer)
    }

    if (response.status === 429 || response.status >= 500) {
      throw new TransientFoundryError(`Foundry responded ${response.status}`, retryAfterMs(response))
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      if (response.status === 400 && /content_filter|ResponsibleAI/i.test(detail)) {
        throw new ContentBlockedError('Content was blocked by the safety filter')
      }
      throw new Error(`Foundry request ${method} ${path} failed with ${response.status}: ${detail.slice(0, 300)}`)
    }
    return (await response.json()) as T
  }

  private toContent(parts: MessagePart[]): InputContent[] {
    return parts.map((part) =>
      part.type === 'text'
        ? { type: 'input_text', text: part.text }
        : { type: 'input_image', image_url: part.url, detail: 'high' },
    )
  }

  private async createResponse(): Promise<ResponseObject> {
    const created = await this.request<ResponseObject>('POST', '/openai/v1/responses', {
      input: this.history,
      agent_reference: { name: this.env.agentName, type: 'agent_reference' },
    })

    const deadline = Date.now() + this.env.timeoutMs
    let current = created
    while (current.status === 'queued' || current.status === 'in_progress') {
      if (Date.now() > deadline) {
        await this.request('POST', `/openai/v1/responses/${current.id}/cancel`, {}).catch(() => undefined)
        throw new TransientFoundryError('Foundry response timed out')
      }
      await sleep(POLL_INTERVAL_MS)
      current = await this.request<ResponseObject>('GET', `/openai/v1/responses/${current.id}`)
    }

    if (current.status === 'completed') return current
    if (current.status === 'failed') {
      const code = current.error?.code ?? ''
      if (/content_filter/i.test(code)) throw new ContentBlockedError(current.error?.message ?? 'Content filtered')
      if (/rate_limit|server_error|timeout/i.test(code)) throw new TransientFoundryError(`Foundry response failed: ${code}`)
      throw new Error(`Foundry response failed: ${code} ${current.error?.message ?? ''}`.trim())
    }
    if (current.status === 'incomplete' && /content_filter/i.test(current.incomplete_details?.reason ?? '')) {
      throw new ContentBlockedError('Content was blocked by the safety filter')
    }
    if (current.status === 'cancelled') throw new TransientFoundryError('Foundry response was cancelled')
    throw new Error(`Foundry response ended in unexpected status "${current.status}"`)
  }

  // Temperature, output cap, tools and model are the agent's own settings, so TurnOptions is not sent.
  async send(parts: MessagePart[], options: TurnOptions): Promise<TurnResult> {
    this.history.push({ role: 'user', content: this.toContent(parts) })
    const response = await withTransportRetry(() => this.createResponse())
    const text = replyText(response)
    this.history.push({ role: 'assistant', content: text })

    const toolEvents = toolEventsOf(response)
    return {
      text,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      codeInterpreterSessions: toolEvents.some((event) => event.tool === 'code_interpreter') ? 1 : 0,
      toolEvents,
      model: response.model ?? options.model,
    }
  }

  async close(): Promise<void> {
    // Nothing to release: the history lives in this object.
  }
}

export function createRestSession(): AgentSession {
  return new RestSession(getFoundryEnv())
}
