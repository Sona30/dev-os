/**
 * Evaluates a plain arithmetic expression using only digits, + - * / ( ) and decimal points.
 * This is the app's own independent re-check of the model's answer (layer 2 of FR-07). It is a small
 * recursive-descent parser, so nothing the model writes is ever executed as code. Returns null if the
 * expression is malformed, too long, divides by zero, or yields something that is not a finite number.
 */
export function evaluateArithmetic(expression: string): number | null {
  const source = expression.replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '')
  if (source.length === 0 || source.length > 100 || !/^[0-9+\-*/().]+$/.test(source)) return null

  let index = 0
  let failed = false

  const peek = () => source[index]

  function parseNumber(): number {
    const match = /^\d+(?:\.\d+)?/.exec(source.slice(index))
    if (!match) {
      failed = true
      return 0
    }
    index += match[0].length
    return Number(match[0])
  }

  function parseFactor(): number {
    const char = peek()
    if (char === '-') {
      index++
      return -parseFactor()
    }
    if (char === '(') {
      index++
      const value = parseExpression()
      if (peek() !== ')') failed = true
      else index++
      return value
    }
    return parseNumber()
  }

  function parseTerm(): number {
    let value = parseFactor()
    while (!failed && (peek() === '*' || peek() === '/')) {
      const operator = source[index++]
      const right = parseFactor()
      if (operator === '*') value *= right
      else if (right === 0) failed = true
      else value /= right
    }
    return value
  }

  function parseExpression(): number {
    let value = parseTerm()
    while (!failed && (peek() === '+' || peek() === '-')) {
      const operator = source[index++]
      const right = parseTerm()
      value = operator === '+' ? value + right : value - right
    }
    return value
  }

  const result = parseExpression()
  if (failed || index !== source.length || !Number.isFinite(result)) return null
  return Math.round(result * 1e9) / 1e9
}
