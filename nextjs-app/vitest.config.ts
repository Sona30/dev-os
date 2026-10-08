import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // `server-only` guards Next.js bundles and would throw when services are imported in a unit test.
      'server-only': path.resolve(__dirname, 'scripts/shims/server-only.mjs'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
})
