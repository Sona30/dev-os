// Bundles netlify/functions/*.ts into netlify/functions-dist/*.mjs so the functions can use the same
// code as the app (the "@/..." alias) and the `server-only` import is neutralised outside Next.js.
import { build } from 'esbuild'
import { readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = path.join(root, 'netlify', 'functions')
const outDir = path.join(root, 'netlify', 'functions-dist')

const entryPoints = readdirSync(sourceDir)
  .filter((file) => file.endsWith('.ts'))
  .map((file) => path.join(sourceDir, file))

rmSync(outDir, { recursive: true, force: true })

if (entryPoints.length === 0) {
  console.log('No Netlify functions to build.')
  process.exit(0)
}

await build({
  entryPoints,
  outdir: outDir,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // sharp is a native module (image cropping for the review queue); it cannot be bundled and is shipped alongside
  // the functions via `included_files` in netlify.toml.
  external: ['sharp'],
  tsconfig: path.join(root, 'tsconfig.json'),
  alias: { 'server-only': path.join(root, 'scripts', 'shims', 'server-only.mjs') },
  // Some dependencies (pino) use require(); give the ESM bundle a require.
  banner: { js: "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);" },
  logLevel: 'info',
})

console.log(`Built ${entryPoints.length} Netlify function(s) to ${path.relative(root, outDir)}`)
