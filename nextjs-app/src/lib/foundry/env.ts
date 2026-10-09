import { DEFAULT_TIMEOUT_MS } from './config'

export interface FoundryEnv {
  /** Project endpoint, e.g. https://<resource>.services.ai.azure.com/api/projects/<project>. */
  endpoint: string
  /** Name of the agent in the Foundry portal; requests refer to it with an agent_reference. */
  agentName: string
  /** Labels usage rows only. The model that answers is the one configured on the agent in Foundry. */
  modelDeployment: string
  graderDeployment: string
  timeoutMs: number
}

/** Reads and checks the Foundry settings. Throws a plain Error naming the missing variables. */
export function getFoundryEnv(): FoundryEnv {
  const endpoint = process.env.FOUNDRY_ENDPOINT
  const agentName = process.env.FOUNDRY_AGENT_NAME
  const missing = [!endpoint && 'FOUNDRY_ENDPOINT', !agentName && 'FOUNDRY_AGENT_NAME'].filter(Boolean)
  if (missing.length > 0 || !endpoint || !agentName) {
    throw new Error(`Foundry is not configured. Set ${missing.join(', ')} in .env.local (see .env.example).`)
  }
  const modelDeployment = process.env.FOUNDRY_MODEL_DEPLOYMENT || agentName
  const timeout = Number(process.env.FOUNDRY_API_TIMEOUT_MS)
  return {
    endpoint: endpoint.replace(/\/$/, ''),
    agentName,
    modelDeployment,
    graderDeployment: process.env.FOUNDRY_GRADER_DEPLOYMENT || modelDeployment,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  }
}

export function isMockEnabled(): boolean {
  return process.env.FOUNDRY_MOCK === 'true'
}
