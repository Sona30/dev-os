// Creates or updates the single "testready-agent" so the Foundry portal never holds hand-edited instructions
// (docs/specs/05 §1, §3). Instructions come from prompts/<version>/system.md in this repository.
// Run:  npm run agent:sync
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { foundryFetch, jsonInit, requireEnv } from './lib/foundry-rest.mjs'

requireEnv('FOUNDRY_ENDPOINT', 'FOUNDRY_MODEL_DEPLOYMENT')

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const version = readFileSync(path.join(root, 'prompts', 'VERSION'), 'utf8').trim()
const major = version.split('.').slice(0, 2).join('.')
const instructions = readFileSync(path.join(root, 'prompts', `v${major}`, 'system.md'), 'utf8').trim()

const body = {
  name: 'testready-agent',
  description: `TestReady math learning agent (prompt v${version})`,
  model: process.env.FOUNDRY_MODEL_DEPLOYMENT,
  instructions,
  temperature: 0.2,
  tools: [{ type: 'file_search' }, { type: 'code_interpreter' }],
  ...(process.env.FOUNDRY_VECTOR_STORE_ID
    ? { tool_resources: { file_search: { vector_store_ids: [process.env.FOUNDRY_VECTOR_STORE_ID] } } }
    : {}),
}

if (!process.env.FOUNDRY_VECTOR_STORE_ID) {
  console.warn('FOUNDRY_VECTOR_STORE_ID is not set: the agent will be created without a knowledge base. Run npm run kb:sync first.')
}

const existingId = process.env.FOUNDRY_AGENT_ID
const agent = existingId
  ? await foundryFetch(`/assistants/${existingId}`, jsonInit('POST', body))
  : await foundryFetch('/assistants', jsonInit('POST', body))

console.log(`${existingId ? 'Updated' : 'Created'} agent ${agent.id} (prompt v${version})`)
if (!existingId) console.log('Set FOUNDRY_AGENT_ID to this value in .env.local and your Netlify environment.')
