import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Used by `npm run eval` (vite-node) so the evaluation runner can import app code through the "@/" alias.
// `server-only` guards Next.js bundles; outside Next.js it would throw, so it is aliased to an empty module.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'server-only': path.resolve(__dirname, 'scripts/shims/server-only.mjs'),
    },
  },
  test: { environment: 'node', include: ['tests/unit/**/*.test.ts'] },
})
