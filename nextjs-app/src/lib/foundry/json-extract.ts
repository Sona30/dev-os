/**
 * Pulls the machine-readable JSON out of an agent reply.
 * The reply is a short human-readable write-up followed by a fenced ```json block; if the fence is
 * missing we fall back to the first balanced {...} object. Returns the text before the JSON as `narrative`.
 */
export interface ExtractedJson {
  json: unknown
  narrative: string
}

function firstBalancedObject(text: string): { start: number; end: number } | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const char = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') depth++
    else if (char === '}') {
      depth--
      if (depth === 0) return { start, end: i + 1 }
    }
  }
  return null
}

export function extractJson(text: string): ExtractedJson | null {
  const fence = /```json\s*([\s\S]*?)```/i.exec(text)
  if (fence && fence[1] !== undefined) {
    try {
      return { json: JSON.parse(fence[1]), narrative: text.slice(0, fence.index).trim() }
    } catch {
      return null
    }
  }
  const range = firstBalancedObject(text)
  if (!range) return null
  try {
    return { json: JSON.parse(text.slice(range.start, range.end)), narrative: text.slice(0, range.start).trim() }
  } catch {
    return null
  }
}
