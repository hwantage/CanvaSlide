import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'

// Import restrictions need no type service in the isolated fixture checkout.
const config = {
  ...JSON.parse(readFileSync(new URL('../../.oxlintrc.json', import.meta.url), 'utf8')),
  options: undefined
}
const oxlint = resolve(
  dirname(fileURLToPath(import.meta.resolve('oxlint/package.json'))),
  'bin/oxlint'
)
let root

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'canvaslide-import-boundaries-'))
  writeFileSync(join(root, '.oxlintrc.json'), JSON.stringify(config))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function check(fixtures) {
  for (const [file, source] of fixtures) {
    const path = join(root, file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, source)
  }
  const result = spawnSync(process.execPath, [oxlint, '--format', 'json', '--threads', '1'], {
    cwd: root,
    encoding: 'utf8'
  })
  assert.equal(result.error, undefined)
  assert.ok(result.status === 0 || result.status === 1, result.stderr)
  const { diagnostics } = JSON.parse(result.stdout)
  assert.ok(
    diagnostics.every((entry) => entry.code === 'eslint(no-restricted-imports)'),
    result.stdout
  )
  assert.equal(result.status, diagnostics.length ? 1 : 0)
  return [...new Set(diagnostics.map((entry) => entry.filename.replaceAll('\\', '/')))].sort(
    (a, b) => a.localeCompare(b)
  )
}

test('shared rejects framework subpaths and renderer aliases and paths at every depth', () => {
  const forbidden = [
    'react',
    'react/jsx-runtime',
    'react-dom',
    'react-dom/client',
    'zustand',
    'zustand/vanilla',
    '@tauri-apps/api/core',
    '@tauri-apps/plugin-dialog',
    '@/store/document-store',
    '@/i18n/ui-strings',
    '@app/i18n/translator',
    '../renderer/src/store/document-store',
    '../../renderer/src/i18n/ui-strings',
    '../../../renderer/src/i18n/locales/en',
    'src/renderer/src/store/document-store',
    '@shared/../renderer/src/store/document-store'
  ]
  const fixtures = forbidden.flatMap((source, i) =>
    ['src/shared', 'src/shared/canvas', 'src/shared/presentation/deep'].map((dir) => [
      `${dir}/probe-${i}.ts`,
      `import '${source}'\n`
    ])
  )
  assert.deepEqual(
    check(fixtures),
    fixtures.map(([file]) => file).sort((a, b) => a.localeCompare(b))
  )
})

test('player rejects renderer dependencies including type imports and re-exports', () => {
  const fixtures = [
    ['src/player/probe.ts', "import '@/store/document-store'\n"],
    ['src/player/nested/probe.ts', "import '../../renderer/src/i18n/ui-strings'\n"],
    [
      'src/player/type.test.ts',
      "import type { Locale } from '@app/i18n/translator'\nexport type { Locale }\n"
    ],
    [
      'src/player/inline-type.ts',
      "import { type Locale, createTranslator } from '@/i18n/translator'\nexport { type Locale, createTranslator }\n"
    ],
    ['src/player/reexport.ts', "export * from '../renderer/src/store/document-store'\n"],
    ['src/player/named-export.ts', "export { t } from '@/i18n/ui-strings'\n"],
    ['src/player/type-export.ts', "export type { Locale } from '@/i18n/translator'\n"],
    ['src/player/dynamic.ts', "export const load = () => import('@/store/document-store')\n"]
  ]
  assert.deepEqual(
    check(fixtures),
    fixtures.map(([file]) => file).sort((a, b) => a.localeCompare(b))
  )
})

test('website permits only the five exact app module specifiers', () => {
  const allowed = [
    '@app/i18n/translator',
    '@app/i18n/ui-strings',
    '@app/i18n/string-table-checks',
    '@app/lib/ai-prompt',
    '@app/lib/platform-keys'
  ]
  const forbidden = [
    '@app',
    '@app/',
    '@app/i18n',
    '@app/lib',
    '@app/store/document-store',
    '@app/i18n/locales/en',
    '@app/lib/document/launch-links',
    ...allowed.flatMap((source) => [`${source}-extra`, `${source}/extra`, `${source}.ts`])
  ]
  const fixtures = [...allowed, ...forbidden].map((source, i) => [
    `website/src/nested/probe-${i}.tsx`,
    `import '${source}'\n`
  ])
  assert.deepEqual(
    check(fixtures),
    fixtures
      .slice(allowed.length)
      .map(([file]) => file)
      .sort((a, b) => a.localeCompare(b))
  )
})

test('shared restrictions include type dependencies and all static export forms', () => {
  const fixtures = [
    [
      'src/shared/canvas/type.ts',
      "import type { ReactNode } from 'react'\nexport type { ReactNode }\n"
    ],
    ['src/shared/media/reexport.ts', "export * from 'zustand'\n"],
    ['src/shared/presentation/named-export.ts', "export { createRoot } from 'react-dom/client'\n"],
    ['src/shared/ui/type-export.ts', "export type { Locale } from '@/i18n/translator'\n"],
    ['src/shared/render/dynamic.ts', "export const load = () => import('@tauri-apps/api/core')\n"]
  ]
  assert.deepEqual(
    check(fixtures),
    fixtures.map(([file]) => file).sort((a, b) => a.localeCompare(b))
  )
})

test('allowed shared dependencies and renderer imports remain unrestricted', () => {
  assert.deepEqual(
    check([
      ['src/shared/canvas/probe.ts', "import 'zod'\nimport '../presentation/presentation-keys'\n"],
      ['src/shared/media/probe.ts', "import '@shared/canvas/element-runtime'\n"],
      [
        'src/player/probe.ts',
        "import '@shared/presentation/presentation-keys'\nimport '../shared/media/video-focus'\n"
      ],
      ['website/src/probe.tsx', "import 'react'\nimport '@shared/example-catalog'\n"],
      [
        'src/renderer/src/probe.tsx',
        "import 'react'\nimport 'react-dom/client'\nimport 'zustand'\nimport '@tauri-apps/api/core'\nimport '@/i18n/ui-strings'\n"
      ],
      ['website/example-exports.ts', "import '@app/lib/document/html-export'\n"]
    ]),
    []
  )
})
