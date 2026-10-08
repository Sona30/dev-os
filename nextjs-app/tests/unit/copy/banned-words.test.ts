import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Copy rule (docs/specs/11 §5, 16 §9): text a parent reads is encouraging and never labels the child.
// Say "still building", "next step", "ready for more" — not "weak", "behind" or "failing".

const BANNED = /\b(weak|behind|failing|lazy|dumb)\b/i
const SRC = path.resolve(__dirname, '../../../src')
// Operator alerts go to the team's webhook or inbox, never to a parent, and must say plainly when jobs are failing.
const OPERATOR_ONLY = ['lib/observability/alerts.ts']

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    // Generated prompt bundles quote the rule itself ("never say weak"), so they are skipped.
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.generated.ts') ? [full] : []
  })
}

function withoutComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** String literals plus text between JSX tags: the places words reach a parent. */
function visibleText(code: string): string[] {
  const text: string[] = []
  for (const match of code.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) text.push(match[2] ?? '')
  for (const match of code.matchAll(/>([^<>{}]+)</g)) text.push(match[1] ?? '')
  return text
}

describe('parent-facing copy', () => {
  it('never uses words that label a child', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      if (OPERATOR_ONLY.includes(path.relative(SRC, file))) continue
      for (const text of visibleText(withoutComments(readFileSync(file, 'utf8')))) {
        if (BANNED.test(text)) offenders.push(`${path.relative(SRC, file)}: "${text.trim().slice(0, 60)}"`)
      }
    }
    expect(offenders).toEqual([])
  })
})
