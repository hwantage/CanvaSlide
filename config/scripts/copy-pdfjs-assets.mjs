// Why: pdf.js loads its worker, the 14 standard fonts and image-decoder wasm by URL at runtime.
// Copying them into the renderer's public dir serves them from the app origin in dev, in the
// Tauri bundle and under the strict CSP, without any bundler-specific worker plumbing.
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const source = dirname(require.resolve('pdfjs-dist/package.json'))
// Why: `URL.pathname` yields `/D:/...` on Windows; fileURLToPath gives a real filesystem path.
const target = fileURLToPath(new URL('../../src/renderer/public/pdfjs/', import.meta.url))

rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
cpSync(join(source, 'build/pdf.worker.min.mjs'), join(target, 'pdf.worker.min.mjs'))
cpSync(join(source, 'standard_fonts'), join(target, 'standard_fonts'), { recursive: true })
cpSync(join(source, 'wasm'), join(target, 'wasm'), { recursive: true })
console.log('pdfjs assets: ok')
