import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRestSession } from '@/lib/foundry/rest-session'
import { ContentBlockedError } from '@/lib/foundry/retry'
import type { TurnOptions } from '@/lib/foundry/types'

vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: class {
    getToken = async () => ({ token: 'test-token', expiresOnTimestamp: Date.now() + 60_000 })
  },
}))

const OPTIONS: TurnOptions = { temperature: 0.2, maxOutputTokens: 1000, tools: ['file_search'], model: 'label' }
const ENDPOINT = 'https://res.services.ai.azure.com/api/projects/proj'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function reply(text: string, extra: Record<string, unknown> = {}) {
  return {
    id: 'resp_1',
    status: 'completed',
    model: 'gpt-test',
    output: [
      { type: 'file_search_call', status: 'completed' },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] },
    ],
    usage: { input_tokens: 120, output_tokens: 30 },
    ...extra,
  }
}

describe('Foundry Responses transport', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    process.env.FOUNDRY_ENDPOINT = `${ENDPOINT}/`
    process.env.FOUNDRY_AGENT_NAME = 'TestReady1'
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    fetchMock.mockReset()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    delete process.env.FOUNDRY_ENDPOINT
    delete process.env.FOUNDRY_AGENT_NAME
  })

  it('names the agent and sends only input: no model, instructions, temperature or tools', async () => {
    fetchMock.mockResolvedValue(jsonResponse(reply('hello')))
    await createRestSession().send([{ type: 'text', text: 'hi' }], OPTIONS)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`${ENDPOINT}/openai/v1/responses`)
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-token')
    const body = JSON.parse(String(init?.body))
    expect(Object.keys(body).sort()).toEqual(['agent_reference', 'input'])
    expect(body.agent_reference).toEqual({ name: 'TestReady1', type: 'agent_reference' })
    expect(body.input).toEqual([{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }])
  })

  it('sends images as input_image parts', async () => {
    fetchMock.mockResolvedValue(jsonResponse(reply('ok')))
    await createRestSession().send(
      [
        { type: 'text', text: 'Image: Report page 1' },
        { type: 'image', url: 'https://example.test/p1.png' },
      ],
      OPTIONS,
    )
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))
    expect(body.input[0].content[1]).toEqual({ type: 'input_image', image_url: 'https://example.test/p1.png', detail: 'high' })
  })

  it('returns the reply text, token counts, model and tool events', async () => {
    fetchMock.mockResolvedValue(jsonResponse(reply('the answer')))
    const turn = await createRestSession().send([{ type: 'text', text: 'q' }], OPTIONS)
    expect(turn.text).toBe('the answer')
    expect(turn.inputTokens).toBe(120)
    expect(turn.outputTokens).toBe(30)
    expect(turn.model).toBe('gpt-test')
    expect(turn.toolEvents).toEqual([{ tool: 'file_search', status: 'completed' }])
    expect(turn.codeInterpreterSessions).toBe(0)
  })

  it('counts a code interpreter session', async () => {
    const body = reply('x')
    body.output.unshift({ type: 'code_interpreter_call', status: 'completed' })
    fetchMock.mockResolvedValue(jsonResponse(body))
    const turn = await createRestSession().send([{ type: 'text', text: 'q' }], OPTIONS)
    expect(turn.codeInterpreterSessions).toBe(1)
  })

  it('resends the earlier turns on the corrective retry', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(reply('first'))).mockResolvedValueOnce(jsonResponse(reply('second')))
    const session = createRestSession()
    await session.send([{ type: 'text', text: 'one' }], OPTIONS)
    await session.send([{ type: 'text', text: 'fix it' }], OPTIONS)
    const second = JSON.parse(String(fetchMock.mock.calls[1]![1]?.body))
    expect(second.input.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(second.input[1].content).toBe('first')
  })

  it('retries a 429 and then succeeds', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(new Response('busy', { status: 429 })).mockResolvedValueOnce(jsonResponse(reply('ok')))
    const promise = createRestSession().send([{ type: 'text', text: 'q' }], OPTIONS)
    await vi.runAllTimersAsync()
    await expect(promise).resolves.toMatchObject({ text: 'ok' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('maps a content-filter 400 to ContentBlockedError', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":{"code":"content_filter"}}', { status: 400 }))
    await expect(createRestSession().send([{ type: 'text', text: 'q' }], OPTIONS)).rejects.toBeInstanceOf(ContentBlockedError)
  })

  it('maps a failed response with a content_filter code to ContentBlockedError', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'r', status: 'failed', error: { code: 'content_filter', message: 'blocked' } }))
    await expect(createRestSession().send([{ type: 'text', text: 'q' }], OPTIONS)).rejects.toBeInstanceOf(ContentBlockedError)
  })

  it('polls a queued response until it completes', async () => {
    vi.useFakeTimers()
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 'resp_9', status: 'queued' }))
      .mockResolvedValueOnce(jsonResponse(reply('done', { id: 'resp_9' })))
    const promise = createRestSession().send([{ type: 'text', text: 'q' }], OPTIONS)
    await vi.runAllTimersAsync()
    await expect(promise).resolves.toMatchObject({ text: 'done' })
    expect(String(fetchMock.mock.calls[1]![0])).toBe(`${ENDPOINT}/openai/v1/responses/resp_9`)
  })

  it('names the missing settings when Foundry is not configured', () => {
    delete process.env.FOUNDRY_AGENT_NAME
    expect(() => createRestSession()).toThrow(/FOUNDRY_AGENT_NAME/)
  })
})
