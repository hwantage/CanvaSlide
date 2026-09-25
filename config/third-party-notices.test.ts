// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { THIRD_PARTY_NOTICES_FILE } from '../src/shared/third-party-notices.ts'
import {
  bundledPackages,
  type CargoMetadata,
  cratesFromTree,
  crateTriples,
  dependencyPackages,
  packageRootOf,
  renderNotices,
  servedFileLicenses,
  thirdPartyNotices
} from './third-party-notices.ts'

type CargoPackage = CargoMetadata['packages'][number]

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'canvaslide notices '))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function write(path: string, contents: string): string {
  const file = join(root, path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, contents)
  return file
}

function writePackage(dir: string, manifest: Record<string, unknown>, files = {}): string {
  write(join(dir, 'package.json'), JSON.stringify(manifest))
  for (const [name, text] of Object.entries(files)) {
    write(join(dir, name), String(text))
  }
  return join(root, dir)
}

test('maps bundled module ids to the package they were installed as', () => {
  const store = '/repo/node_modules/.pnpm'
  expect(packageRootOf(`${store}/react@19.3.0/node_modules/react/cjs/react.production.js`)).toBe(
    `${store}/react@19.3.0/node_modules/react`
  )
  expect(
    packageRootOf(`${store}/@tauri-apps+api@2.11.1/node_modules/@tauri-apps/api/core.js`)
  ).toBe(`${store}/@tauri-apps+api@2.11.1/node_modules/@tauri-apps/api`)
  expect(packageRootOf('C:\\repo\\node_modules\\zod\\v4\\index.js?commonjs-es-import')).toBe(
    'C:/repo/node_modules/zod'
  )
  expect(packageRootOf('\0/repo/node_modules/scheduler/index.js?commonjs-proxy')).toBe(
    '/repo/node_modules/scheduler'
  )
  for (const id of [
    '/repo/src/renderer/src/App.tsx',
    '\0vite/preload-helper.js',
    '/repo/node_modules/'
  ]) {
    expect(packageRootOf(id)).toBeNull()
  }
})

test('lists each bundled release once with the license files it ships', () => {
  const store = 'node_modules/.pnpm'
  const first = writePackage(
    `${store}/zustand@5.0.15_react@19/node_modules/zustand`,
    { name: 'zustand', version: '5.0.15', license: 'MIT' },
    { LICENSE: '\n\nMIT\r\nzustand\r\n', 'license-checker.js': 'code', 'licenses.json': '{}' }
  )
  const second = writePackage(
    `${store}/zustand@5.0.15_react@18/node_modules/zustand`,
    { name: 'zustand', version: '5.0.15', license: 'MIT' },
    { LICENSE: 'MIT\nzustand' }
  )
  const dual = writePackage(
    `${store}/@scope+dual@1.0.0/node_modules/@scope/dual`,
    { name: '@scope/dual', version: '1.0.0', license: 'MIT OR Apache-2.0' },
    {
      'LICENSE-MIT': 'MIT dual',
      'LICENSE_APACHE-2.0': '  Apache\n',
      'LICENCE MIT.txt': 'Licence',
      COPYING: 'Copying',
      COPYRIGHT: 'Copyright',
      NOTICE: 'Notice',
      'LICENSE.spdx': 'SPDXVersion: SPDX-2.1',
      README: 'not a license'
    }
  )
  mkdirSync(join(dual, 'LICENSE-texts'))
  const bare = writePackage(`${store}/bare@2.0.0/node_modules/bare`, {
    name: 'bare',
    version: '2.0.0',
    license: { type: 'MIT' }
  })
  const packages = bundledPackages([
    `${second}/index.js`,
    `${dual}/dist/index.js`,
    `${first}/esm/vanilla.mjs`,
    `${bare}/index.js`,
    join(root, 'src/app.ts')
  ])
  expect(
    packages.map(({ name, version, license, source }) => [name, version, license, source])
  ).toEqual([
    [
      '@scope/dual',
      '1.0.0',
      'MIT OR Apache-2.0',
      'https://www.npmjs.com/package/@scope/dual/v/1.0.0'
    ],
    ['bare', '2.0.0', 'MIT', 'https://www.npmjs.com/package/bare/v/2.0.0'],
    ['zustand', '5.0.15', 'MIT', 'https://www.npmjs.com/package/zustand/v/5.0.15']
  ])
  expect(packages[0]?.licenseFiles).toEqual([
    { name: 'COPYING', text: 'Copying' },
    { name: 'COPYRIGHT', text: 'Copyright' },
    { name: 'LICENCE MIT.txt', text: 'Licence' },
    { name: 'LICENSE-MIT', text: 'MIT dual' },
    { name: 'LICENSE_APACHE-2.0', text: '  Apache' },
    { name: 'NOTICE', text: 'Notice' }
  ])
  expect(packages[1]?.licenseFiles).toEqual([])
  expect(packages[2]?.licenseFiles).toEqual([{ name: 'LICENSE', text: 'MIT\nzustand' }])
})

test('the dev server lists the runtime dependency tree, not dev tools or optional binaries', () => {
  writePackage('.', {
    dependencies: { app: '1' },
    optionalDependencies: { native: '1' },
    devDependencies: { tool: '1' }
  })
  const store = 'node_modules/.pnpm'
  writePackage(`${store}/app@1.0.0/node_modules/app`, {
    name: 'app',
    version: '1.0.0',
    dependencies: { inner: '1' },
    optionalDependencies: { native: '1' }
  })
  writePackage(`${store}/inner@3.0.0/node_modules/inner`, { name: 'inner', version: '3.0.0' })
  writePackage('node_modules/tool', { name: 'tool', version: '1.0.0' })
  writePackage('node_modules/native', { name: 'native', version: '1.0.0' })
  // Why 'junction': Windows needs no elevated rights for it, unlike a directory symlink.
  symlinkSync(
    join(root, `${store}/app@1.0.0/node_modules/app`),
    join(root, 'node_modules/app'),
    'junction'
  )
  symlinkSync(
    join(root, `${store}/inner@3.0.0/node_modules/inner`),
    join(root, `${store}/app@1.0.0/node_modules/inner`),
    'junction'
  )
  expect(dependencyPackages(root).map(({ name }) => name)).toEqual(['app', 'inner'])
})

test('crates are the packages cargo tree prints, joined with their metadata', () => {
  const crate = (name: string, version: string, extra: Partial<CargoPackage> = {}) => ({
    id: `${name}-${version}-id`,
    name,
    version,
    license: 'MIT',
    license_file: null,
    source: 'registry+https://github.com/rust-lang/crates.io-index',
    repository: null,
    manifest_path: join(root, 'crates', `${name}-${version}`, 'Cargo.toml'),
    ...extra
  })
  const metadata: CargoMetadata = {
    packages: [
      crate('app', '0.1.0', { source: null }),
      crate('linked', '1.0.0', { license: 'MPL-2.0' }),
      crate('shared', '0.9.4'),
      crate('shared', '0.10.1'),
      crate('declared', '1.0.0', { license: null, license_file: './COPYRIGHT.txt' }),
      crate('missing-file', '1.0.0', { license_file: 'LICENSE.custom' }),
      crate('local', '1.0.0', { source: null, repository: 'https://example.com/local' }),
      crate('build-only', '1.0.0')
    ],
    resolve: { root: 'app-0.1.0-id' }
  }
  for (const pkg of metadata.packages) {
    mkdirSync(dirname(pkg.manifest_path), { recursive: true })
  }
  write('crates/linked-1.0.0/LICENSE', 'MPL text')
  write('crates/declared-1.0.0/COPYRIGHT.txt', 'Copyright declared')
  write('crates/declared-1.0.0/LICENSE-MIT', 'MIT declared')
  const tree = [
    `app v0.1.0 (${root}/app)`,
    'linked v1.0.0',
    'shared v0.10.1',
    'shared v0.9.4',
    'declared v1.0.0',
    'shared v0.9.4 (*)',
    'missing-file v1.0.0',
    'local v1.0.0 (/somewhere/local)',
    ''
  ].join('\n')
  const crates = cratesFromTree(tree, metadata)
  expect(
    crates.map(({ name, version, license, source }) => [name, version, license, source])
  ).toEqual([
    ['declared', '1.0.0', null, 'https://crates.io/crates/declared/1.0.0'],
    ['linked', '1.0.0', 'MPL-2.0', 'https://crates.io/crates/linked/1.0.0'],
    ['local', '1.0.0', 'MIT', 'https://example.com/local'],
    ['missing-file', '1.0.0', 'MIT', 'https://crates.io/crates/missing-file/1.0.0'],
    ['shared', '0.9.4', 'MIT', 'https://crates.io/crates/shared/0.9.4'],
    ['shared', '0.10.1', 'MIT', 'https://crates.io/crates/shared/0.10.1']
  ])
  expect(crates[0]?.licenseFiles.map(({ name }) => name)).toEqual(['COPYRIGHT.txt', 'LICENSE-MIT'])
  expect(crates[3]?.licenseFiles).toEqual([])
})

test('a universal macOS build lists the crates of both architectures', () => {
  expect(crateTriples('universal-apple-darwin')).toEqual([
    'aarch64-apple-darwin',
    'x86_64-apple-darwin'
  ])
  expect(crateTriples('x86_64-pc-windows-msvc')).toEqual(['x86_64-pc-windows-msvc'])
})

test('license files among static files are listed by the folder they cover', () => {
  write('public/_headers', '/*')
  write('public/pdfjs/pdf.worker.min.mjs', '')
  write('public/pdfjs/wasm/LICENSE_OPENJPEG', 'BSD openjpeg')
  write('public/pdfjs/wasm/LICENSE_QCMS', 'MIT qcms')
  write('public/pdfjs/standard_fonts/LICENSE_FOXIT', 'BSD foxit')
  expect(servedFileLicenses(join(root, 'public'))).toEqual([
    {
      name: 'pdfjs/standard_fonts/',
      version: '',
      license: null,
      source: null,
      licenseFiles: [{ name: 'LICENSE_FOXIT', text: 'BSD foxit' }]
    },
    {
      name: 'pdfjs/wasm/',
      version: '',
      license: null,
      source: null,
      licenseFiles: [
        { name: 'LICENSE_OPENJPEG', text: 'BSD openjpeg' },
        { name: 'LICENSE_QCMS', text: 'MIT qcms' }
      ]
    }
  ])
  expect(servedFileLicenses(join(root, 'missing'))).toEqual([])
})

test('renders every component and each distinct license text once', () => {
  const apache = 'Apache License\nVersion 2.0'
  const text = renderNotices([
    {
      title: 'JavaScript packages',
      components: [
        {
          name: 'pdfjs-dist',
          version: '6.3.289',
          license: 'Apache-2.0',
          source: 'https://www.npmjs.com/package/pdfjs-dist/v/6.3.289',
          licenseFiles: [{ name: 'LICENSE', text: apache }]
        },
        { name: 'saxes', version: '6.0.0', license: 'ISC', source: null, licenseFiles: [] }
      ]
    },
    { title: 'Rust crates in the desktop app', components: [] },
    {
      title: 'Files served with the app',
      components: [
        {
          name: 'pdfjs/wasm/',
          version: '',
          license: null,
          source: null,
          licenseFiles: [{ name: 'LICENSE_PDFJS_JBIG2', text: apache }]
        }
      ]
    }
  ])
  expect(text).toContain(
    [
      'JavaScript packages (2)',
      '-----------------------',
      'pdfjs-dist 6.3.289 (Apache-2.0) https://www.npmjs.com/package/pdfjs-dist/v/6.3.289',
      'saxes 6.0.0 (ISC) - no license file in the package',
      '',
      'Files served with the app (1)',
      '-----------------------------',
      'pdfjs/wasm/',
      '',
      'License texts',
      '-------------',
      '',
      '=== License text 1 ===',
      'Applies to:',
      '  pdfjs-dist 6.3.289 (LICENSE)',
      '  pdfjs/wasm/ (LICENSE_PDFJS_JBIG2)',
      '',
      apache,
      ''
    ].join('\n')
  )
  expect(text).not.toContain('Rust crates')
  expect(text.match(/Apache License/g)).toHaveLength(1)
})

type Hook = (...args: unknown[]) => unknown
function runHook(hook: unknown, context: object, ...args: unknown[]): unknown {
  const handler = typeof hook === 'function' ? hook : (hook as { handler: unknown }).handler
  return (handler as Hook).call(context, ...args)
}

test('a build lists the packages of its chunks, its workers and the build tools', () => {
  write('public/pdfjs/wasm/LICENSE_QCMS', 'MIT qcms')
  const page = writePackage(
    'node_modules/page-only',
    { name: 'page-only', version: '1.0.0', license: 'MIT' },
    { LICENSE: 'page license' }
  )
  const worker = writePackage(
    'node_modules/worker-only',
    { name: 'worker-only', version: '2.0.0', license: 'ISC' },
    { LICENSE: 'worker license' }
  )
  const notices = thirdPartyNotices()
  runHook(notices.plugin.configResolved, {}, { publicDir: join(root, 'public'), base: '/' })
  const workerChunk = { type: 'chunk', modules: { [`${worker}/index.js`]: {} } }
  runHook(notices.worker().generateBundle, {}, {}, { 'worker.js': workerChunk }, false)
  const emitted: { fileName: string; source: string }[] = []
  const bundle = {
    'index.js': { type: 'chunk', modules: { [`${page}/index.js`]: {} } },
    'index.css': { type: 'asset' }
  }
  runHook(
    notices.plugin.generateBundle,
    { emitFile: (file: never) => emitted.push(file) },
    {},
    bundle,
    false
  )
  expect(emitted.map(({ fileName }) => fileName)).toEqual([THIRD_PARTY_NOTICES_FILE])
  const text = emitted[0]!.source
  for (const line of [
    'page-only 1\\.0\\.0 \\(MIT\\)',
    'worker-only 2\\.0\\.0 \\(ISC\\)',
    'vite \\S+ \\(MIT\\)',
    'rolldown \\S+ \\(MIT\\)',
    'tailwindcss \\S+ \\(MIT\\)',
    'pdfjs/wasm/$'
  ]) {
    expect(text).toMatch(new RegExp(`^${line}`, 'm'))
  }
  expect(text).toContain('worker license')
  expect(text).not.toContain('Licenses of bundled dependencies')
  expect(text).not.toContain('Rust crates')
})
