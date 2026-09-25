import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { repoRoot } from '../e2e-server'

const APP_SOURCE = resolve(repoRoot, 'src/renderer/src')

/**
 * The dev-server URL of an app source module, for `import()` in page code, given its path under
 * `src/renderer/src` (for example `store/camera-store.ts`).
 *
 * The app imports each such module at this one URL, so importing it in the page returns the
 * instance the app is running. Why not look the URL up in Resource Timing: startup loads more
 * modules than its 250-entry buffer holds, and whichever arrive last are silently dropped.
 * Editing source while the server runs makes Vite import changed modules at `?t=` URLs instead, so
 * restart a dev server you started yourself before running specs against it.
 */
export function appModuleUrl(path: string): string {
  if (!isAppSourceFile(path)) {
    throw new Error(`No app module at src/renderer/src/${path}`)
  }
  return `/src/${path}`
}

// Why: match on-disk names exactly; macOS accepts a wrong-case path, which Vite serves as a second instance.
function isAppSourceFile(path: string): boolean {
  const names = path.split('/')
  let dir = APP_SOURCE
  for (const [index, name] of names.entries()) {
    const entry = readdirSync(dir, { withFileTypes: true }).find((e) => e.name === name)
    const last = index === names.length - 1
    if (!entry || !(last ? entry.isFile() : entry.isDirectory())) {
      return false
    }
    dir = join(dir, name)
  }
  return true
}
