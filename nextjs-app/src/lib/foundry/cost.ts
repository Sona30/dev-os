// Cost estimate for one call (docs/specs/05 §7): tokens at the configured prices plus a flat
// allowance per Code Interpreter session. Estimates feed usage_events and the cost alerts.

function price(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value >= 0 && process.env[name] ? value : fallback
}

export function estimateCostUsd(usage: {
  inputTokens: number
  outputTokens: number
  codeInterpreterSessions: number
}): number {
  const inputPerMillion = price('FOUNDRY_PRICE_INPUT_PER_1M_USD', 0)
  const outputPerMillion = price('FOUNDRY_PRICE_OUTPUT_PER_1M_USD', 0)
  const sessionCost = price('FOUNDRY_CODE_INTERPRETER_SESSION_USD', 0.03)
  const cost =
    (usage.inputTokens / 1_000_000) * inputPerMillion +
    (usage.outputTokens / 1_000_000) * outputPerMillion +
    usage.codeInterpreterSessions * sessionCost
  return Math.round(cost * 10_000) / 10_000
}
