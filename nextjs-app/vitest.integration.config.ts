import path from 'node:path'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

// Integration tests talk to a real Supabase project and are opt-in: RUN_INTEGRATION=1 npm run test:integration
export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'server-only': path.resolve(__dirname, 'scripts/shims/server-only.mjs'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    env: loadEnv(mode, process.cwd(), ''),
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
}))
