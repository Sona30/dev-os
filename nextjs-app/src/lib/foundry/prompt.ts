import { MODE_PROMPTS } from './prompts.generated'
import type { AgentImage, MessagePart, Mode } from './types'

/**
 * Builds the user message for a call: the mode instructions, then the input contract as JSON,
 * then each image preceded by its label. The system prompt travels separately as the run's instructions.
 */
export function buildMessageParts(mode: Mode, input: object, images: AgentImage[] = []): MessagePart[] {
  const instructions = MODE_PROMPTS[mode]
  if (!instructions) throw new Error(`No prompt is defined for mode "${mode}".`)

  // `_fixture` is a test-only switch for the mock client and must never reach the model.
  const { _fixture: _ignored, ...wireInput } = input as Record<string, unknown>
  void _ignored

  const parts: MessagePart[] = [
    {
      type: 'text',
      text: `${instructions}\n\n# Input (JSON)\n\n\`\`\`json\n${JSON.stringify(wireInput, null, 2)}\n\`\`\``,
    },
  ]
  for (const image of images) {
    parts.push({ type: 'text', text: `Image: ${image.label}` }, { type: 'image', url: image.url })
  }
  return parts
}

export function correctiveMessage(issues: string): MessagePart[] {
  return [
    {
      type: 'text',
      text: `Return only the JSON that matches the schema, in a single \`\`\`json fenced block. Problems found: ${issues}`,
    },
  ]
}
