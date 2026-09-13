// Why: a second guard independent of oxlint so max-lines can't be silenced by inline disables.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = new URL('../../', import.meta.url).pathname
const limits = { ts: 300, tsx: 400, test: 800 }
const skipDirs = new Set(['node_modules', 'dist', 'target', 'coverage', '.git'])

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (skipDirs.has(entry)) {
      continue
    }
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      yield* walk(full)
    } else {
      yield full
    }
  }
}

function limitFor(file) {
  // Why: language resources are flat key/value tables; splitting them would only hide keys.
  if (/\/i18n\/locales\/[a-z-]+\.ts$/.test(file)) {
    return null
  }
  if (/\.test\.tsx?$/.test(file)) {
    return limits.test
  }
  if (file.endsWith('.tsx')) {
    return limits.tsx
  }
  if (file.endsWith('.ts')) {
    return limits.ts
  }
  return null
}

const failures = []
for (const file of walk(join(root, 'src'))) {
  const limit = limitFor(file)
  if (limit === null) {
    continue
  }
  const source = readFileSync(file, 'utf8')
  if (/max-lines/.test(source)) {
    failures.push(`${relative(root, file)}: contains a max-lines disable`)
  }
  const lines = source
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.trim().startsWith('//')).length
  if (lines > limit) {
    failures.push(`${relative(root, file)}: ${lines} lines > ${limit}`)
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('max-lines: ok')
