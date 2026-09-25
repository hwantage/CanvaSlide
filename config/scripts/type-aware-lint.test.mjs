import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(import.meta.url)
const oxlint = join(dirname(require.resolve('oxlint/package.json')), 'bin/oxlint')

const probe = `export function probe(flag: boolean, box: { size?: number } | undefined, side: 'a' | 'b') {
  if (flag === true && box && box.size) {
    return 1
  }
  switch (side) {
    case 'a':
      return 2
    default:
      return 3
  }
}
`

// Lints `source` with the repository's configuration as `pnpm lint` does, returning the rule codes.
function lintCodes(source) {
  const dir = mkdtempSync(join(tmpdir(), 'type-aware-lint-'))
  try {
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({
        extends: join(repoRoot, 'config/tsconfig.base.json'),
        include: ['probe.ts']
      })
    )
    writeFileSync(join(dir, 'probe.ts'), source)
    const result = spawnSync(
      process.execPath,
      [oxlint, '-c', join(repoRoot, '.oxlintrc.json'), '--format', 'json', join(dir, 'probe.ts')],
      { cwd: repoRoot, encoding: 'utf8' }
    )
    assert.equal(result.error, undefined)
    return JSON.parse(result.stdout).diagnostics.map((diagnostic) => diagnostic.code)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('the configured type-aware rules report through the repository lint configuration', () => {
  const codes = lintCodes(probe)
  for (const rule of [
    'no-unnecessary-boolean-literal-compare',
    'prefer-optional-chain',
    'switch-exhaustiveness-check'
  ]) {
    assert.ok(codes.includes(`typescript(${rule})`), `${rule} did not run: ${codes.join(', ')}`)
  }
})
