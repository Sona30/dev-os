// The PDF's built-in Helvetica font uses the WinAnsi character set (essentially Latin-1). Anything outside it
// would make the PDF library throw, so text is mapped to safe equivalents first.

const REPLACEMENTS: Record<string, string> = {
  '‘': "'", '’': "'", '‚': "'", '“': '"', '”': '"', '„': '"',
  '–': '-', '—': '-', '−': '-', '…': '...', '×': 'x', '÷': '/',
  '•': '-', ' ': ' ', ' ': ' ', '​': '',
}

export function toWinAnsi(text: string): string {
  let result = ''
  for (const char of text) {
    const mapped = REPLACEMENTS[char]
    if (mapped !== undefined) {
      result += mapped
      continue
    }
    const code = char.charCodeAt(0)
    // Keep printable ASCII and Latin-1 letters; drop control characters; replace everything else.
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa1 && code <= 0xff) || char === '\n') result += char
    else if (code < 0x20) result += ' '
    else result += '?'
  }
  return result
}
