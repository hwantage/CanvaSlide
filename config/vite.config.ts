import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

const repoRoot = resolve(import.meta.dirname, '..')
const rendererRoot = resolve(repoRoot, 'src/renderer')
const { version } = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'))
const host = process.env.TAURI_DEV_HOST

/**
 * Answers `/__checkout` with `{ canvaslideCheckout: <absolute path> }`.
 *
 * Why: a port is the only thing a client can address, and several checkouts of this repo are worked
 * in parallel. Without a way to ask a running server which tree it belongs to, the E2E suite can
 * attach to a stranger's server and report results for code that is not there.
 *
 * Why the wrapper object rather than the bare path: a server that predates this endpoint answers
 * unknown paths with `index.html` and a 200, so the reply has to be recognisable, not just present.
 */
function checkoutIdentity(): Plugin {
  return {
    name: 'canvaslide:checkout-identity',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__checkout', (_request, response) => {
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({ canvaslideCheckout: repoRoot }))
      })
    }
  }
}

// Why: Tauri watches src-tauri itself; Vite must not restart on Rust changes.
export default defineConfig({
  root: rendererRoot,
  plugins: [react(), tailwindcss(), checkoutIdentity()],
  resolve: {
    alias: {
      '@': resolve(rendererRoot, 'src'),
      '@shared': resolve(repoRoot, 'src/shared')
    }
  },
  clearScreen: false,
  // Why: discovering pdfjs-dist on first use makes the dev server re-bundle and reload the page
  // mid-import; pre-bundling it keeps a PDF drop (and the E2E for it) uninterrupted.
  optimizeDeps: { include: ['pdfjs-dist'] },
  server: {
    // Why: 1420 is the port `tauri.conf.json` points `devUrl` at, so it stays the default. The E2E
    // suite overrides it to keep off the dev server's back; see `tests/playwright.config.ts`.
    port: Number(process.env.CANVASLIDE_DEV_PORT ?? 1420),
    strictPort: true,
    host: host ?? false,
    ...(host ? { hmr: { protocol: 'ws', host, port: 1421 } } : {}),
    watch: { ignored: ['**/src-tauri/**'] }
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  // Why: the update check compares against the running version without a Tauri call.
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    outDir: resolve(repoRoot, 'dist'),
    emptyOutDir: true,
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG)
  }
})
