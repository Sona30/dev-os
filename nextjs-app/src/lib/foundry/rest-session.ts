import { DefaultAzureCredential } from '@azure/identity'
import { SYSTEM_PROMPT } from './prompts.generated'
import { getFoundryEnv, type FoundryEnv } from './env'
import { ContentBlockedError, TransientFoundryError, withTransportRetry } from './retry'
import type { AgentSession, MessagePart, ToolEvent, TurnOptions, TurnResult } from './types'

// Talks to the Azure AI Foundry Agent Service REST API: one thread per call, deleted afterwards.
// REST (rather than the preview SDK) keeps this layer small, stable and easy to mock.

const TOKEN_SCOPE = 'https://ai.azure.com/.default'
const REQUEST_TIMEOUT_MS = 30_000
const POLL_INTERVAL_MS = 1000

let credential: DefaultAzureCredential | null = null

async function authorizationHeader(): Promise<string> {
  credential ??= new DefaultAzureCredential()
  const token = await credential.getToken(TOKEN_SCOPE)
  if (!token) throw new Error('Could not obtain an Azure access token. Check the AZURE_* settings.')
  return `Bearer ${token.token}`
}

interface RunObject {
  id: string
  status: string
  model?: string
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null
  last_error?: { code?: string; message?: string } | null
}

interface MessageObject {
  role: string
  run_id?: string | null
  content: Array<{ type: string; text?: { value?: string } }>
}

interface StepObject {
  step_details?: { type?: string; tool_calls?: Array<{ type?: string }> }
  status?: string
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get('retry-after')
  const seconds = header ? Number(header) : NaN
  return Number.isFinite(seconds) ? seconds * 1000 : undefined
}

class RestSession implements AgentSession {
  private threadId: string | null = null

  constructor(private readonly env: FoundryEnv) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const separator = path.includes('?') ? '&' : '?'
    const url = `${this.env.endpoint}${path}${separator}api-version=${encodeURIComponent(this.env.apiVersion)}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(url, {
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

  private async ensureThread(): Promise<string> {
    if (this.threadId) return this.threadId
    const thread = await withTransportRetry(() => this.request<{ id: string }>('POST', '/threads', {}))
    this.threadId = thread.id
    return thread.id
  }

  private toContent(parts: MessagePart[]) {
    return parts.map((part) =>
      part.type === 'text'
        ? { type: 'text', text: part.text }
        : { type: 'image_url', image_url: { url: part.url, detail: 'high' } },
    )
  }

  private async executeRun(threadId: string, options: TurnOptions): Promise<RunObject> {
    const created = await this.request<RunObject>('POST', `/threads/${threadId}/runs`, {
      assistant_id: this.env.agentId,
      model: options.model,
      // The repository is the source of truth for instructions; they are sent on every run.
      instructions: SYSTEM_PROMPT,
      temperature: options.temperature,
      max_completion_tokens: options.maxOutputTokens,
      tools: options.tools.map((tool) => ({ type: tool })),
    })

    const deadline = Date.now() + this.env.timeoutMs
    let run = created
    while (run.status === 'queued' || run.status === 'in_progress' || run.status === 'cancelling') {
      if (Date.now() > deadline) {
        await this.request('POST', `/threads/${threadId}/runs/${run.id}/cancel`, {}).catch(() => undefined)
        throw new TransientFoundryError('Foundry run timed out')
      }
      await sleep(POLL_INTERVAL_MS)
      run = await this.request<RunObject>('GET', `/threads/${threadId}/runs/${run.id}`)
    }

    if (run.status === 'completed') return run
    if (run.status === 'failed') {
      const code = run.last_error?.code ?? ''
      if (/content_filter/i.test(code)) throw new ContentBlockedError(run.last_error?.message ?? 'Content filtered')
      if (/rate_limit|server_error|timeout/i.test(code)) {
        throw new TransientFoundryError(`Foundry run failed: ${code}`)
      }
      throw new Error(`Foundry run failed: ${code} ${run.last_error?.message ?? ''}`.trim())
    }
    if (run.status === 'cancelled' || run.status === 'expired') {
      throw new TransientFoundryError(`Foundry run ${run.status}`)
    }
    throw new Error(`Foundry run ended in unexpected status "${run.status}"`)
  }

  async send(parts: MessagePart[], options: TurnOptions): Promise<TurnResult> {
    const threadId = await this.ensureThread()

    await withTransportRetry(() =>
      this.request('POST', `/threads/${threadId}/messages`, { role: 'user', content: this.toContent(parts) }),
    )
    const run = await withTransportRetry(() => this.executeRun(threadId, options))

    const messages = await withTransportRetry(() =>
      this.request<{ data: MessageObject[] }>('GET', `/threads/${threadId}/messages?order=desc&limit=10`),
    )
    const reply = messages.data.find((message) => message.role === 'assistant' && message.run_id === run.id)
    const text = (reply?.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text?.value ?? '')
      .join('\n')
      .trim()

    // Tool use is informational (cost + diagnostics); failing to read it must not fail the call.
    let toolEvents: ToolEvent[] = []
    try {
      const steps = await this.request<{ data: StepObject[] }>('GET', `/threads/${threadId}/runs/${run.id}/steps`)
      toolEvents = steps.data.flatMap((step) =>
        (step.step_details?.tool_calls ?? []).map((call) => ({
          tool: call.type ?? 'unknown',
          status: step.status ?? 'unknown',
        })),
      )
    } catch {
      toolEvents = []
    }

    return {
      text,
      inputTokens: run.usage?.prompt_tokens ?? 0,
      outputTokens: run.usage?.completion_tokens ?? 0,
      codeInterpreterSessions: toolEvents.some((event) => event.tool === 'code_interpreter') ? 1 : 0,
      toolEvents,
      model: run.model ?? options.model,
    }
  }

  async close(): Promise<void> {
    if (!this.threadId) return
    const id = this.threadId
    this.threadId = null
    try {
      await this.request('DELETE', `/threads/${id}`)
    } catch {
      // A leftover thread is harmless; a weekly script removes threads older than 24 hours (spec 05 §8).
    }
  }
}

export function createRestSession(): AgentSession {
  return new RestSession(getFoundryEnv())
}
