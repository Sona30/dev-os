// Uploads the knowledge-base files in kb/ to a new Foundry vector store (docs/specs/05 §1-2).
// Run:  npm run kb:sync        then put the printed id in FOUNDRY_VECTOR_STORE_ID and run  npm run agent:sync
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { foundryFetch, jsonInit, requireEnv } from './lib/foundry-rest.mjs'

requireEnv('FOUNDRY_ENDPOINT')

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const kbDir = path.join(root, 'kb')
const files = existsSync(kbDir) ? readdirSync(kbDir).filter((name) => name.endsWith('.md')).sort() : []

if (files.length === 0) {
  console.error('kb/ has no .md files. Add syllabus_grade1.md, syllabus_grade2.md, sample_questions.md and iready_interpretation.md first.')
  process.exit(1)
}

const fileIds = []
for (const name of files) {
  const form = new FormData()
  form.append('purpose', 'assistants')
  form.append('file', new Blob([readFileSync(path.join(kbDir, name))], { type: 'text/markdown' }), name)
  const uploaded = await foundryFetch('/files', { method: 'POST', body: form })
  console.log(`uploaded ${name} → ${uploaded.id}`)
  fileIds.push(uploaded.id)
}

const store = await foundryFetch('/vector_stores', jsonInit('POST', { name: 'testready-kb', file_ids: fileIds }))
console.log(`\nVector store created: ${store.id}`)
console.log('Set FOUNDRY_VECTOR_STORE_ID to this value in .env.local and your Netlify environment, then run: npm run agent:sync')
