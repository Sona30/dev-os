import { DEFAULT_API_VERSION, DEFAULT_TIMEOUT_MS } from './config'

export interface FoundryEnv {
  endpoint: string
  agentId: string
  modelDeployment: string
  graderDeployment: string
  apiVersion: string
  timeoutMs: number
}

/** Reads and checks the Foundry settings. Throws a plain Error naming the missing variables. */
export function getFoundryEnv(): FoundryEnv {
  const endpoint = process.env.FOUNDRY_ENDPOINT
  const agentId = process.env.FOUNDRY_AGENT_ID
  const modelDeployment = process.env.FOUNDRY_MODEL_DEPLOYMENT
  const missing = [
    !endpoint && 'FOUNDRY_ENDPOINT',
    !agentId && 'FOUNDRY_AGENT_ID',
    !modelDeployment && 'FOUNDRY_MODEL_DEPLOYMENT',
  ].filter(Boolean)
  if (missing.length > 0 || !endpoint || !agentId || !modelDeployment) {
    throw new Error(`Foundry is not configured. Set ${missing.join(', ')} in .env.local (see .env.example).`)
  }
  const timeout = Number(process.env.FOUNDRY_API_TIMEOUT_MS)
  return {
    endpoint: endpoint.replace(/\/$/, ''),
    agentId,
    modelDeployment,
    graderDeployment: process.env.FOUNDRY_GRADER_DEPLOYMENT || modelDeployment,
    apiVersion: process.env.FOUNDRY_API_VERSION || DEFAULT_API_VERSION,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  }
}

export function isMockEnabled(): boolean {
  return process.env.FOUNDRY_MOCK === 'true'
}
