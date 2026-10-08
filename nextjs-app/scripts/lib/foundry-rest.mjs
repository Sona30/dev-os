// Minimal Foundry Agent Service REST helper for the one-time setup scripts (kb:sync, agent:sync).
// Authenticates with DefaultAzureCredential (the AZURE_* service principal, or `az login` locally).
import { DefaultAzureCredential } from '@azure/identity'

const SCOPE = 'https://ai.azure.com/.default'
const credential = new DefaultAzureCredential()

export function requireEnv(...names) {
  const missing = names.filter((name) => !process.env[name])
  if (missing.length > 0) {
    console.error(`Missing environment variables: ${missing.join(', ')}. Run with: node --env-file=.env.local ...`)
    process.exit(1)
  }
}

export async function foundryFetch(pathname, init = {}) {
  const endpoint = process.env.FOUNDRY_ENDPOINT.replace(/\/$/, '')
  const apiVersion = process.env.FOUNDRY_API_VERSION || '2025-05-01'
  const separator = pathname.includes('?') ? '&' : '?'
  const token = await credential.getToken(SCOPE)
  if (!token) throw new Error('Could not obtain an Azure access token.')

  const headers = { Authorization: `Bearer ${token.token}`, ...(init.headers ?? {}) }
  const response = await fetch(`${endpoint}${pathname}${separator}api-version=${apiVersion}`, { ...init, headers })
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${pathname} failed: ${response.status} ${await response.text()}`)
  }
  return response.json()
}

export function jsonInit(method, body) {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}
