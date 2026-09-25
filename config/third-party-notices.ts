import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, join, normalize, relative, resolve } from 'node:path'
import type { Plugin, Rolldown } from 'vite'
import { THIRD_PARTY_NOTICES_FILE } from '../src/shared/third-party-notices.ts'

type LicenseFile = { name: string; text: string }
type Component = {
  name: string
  version: string
  license: string | null
  source: string | null
  licenseFiles: LicenseFile[]
}
type NoticeSection = { title: string; components: Component[] }

type CargoPackage = {
  id: string
  name: string
  version: string
  license: string | null
  license_file: string | null
  source: string | null
  repository: string | null
  manifest_path: string
}
export type CargoMetadata = { packages: CargoPackage[]; resolve: { root: string } }

const LICENSE_FILE = /^(licen[cs]e|copying|copyright|notice)([-._ ].*)?$/i
// Why: `license-checker.js` is code and `LICENSE.spdx` is metadata; neither is a license text.
const NOT_LICENSE_TEXT = /\.([cm]?[jt]sx?|json|map|spdx)$/i
const NODE_MODULES = '/node_modules/'
const repoRoot = resolve(import.meta.dirname, '..')

/** The installed package directory a module id comes from, or null for project and virtual modules. */
export function packageRootOf(moduleId: string): string | null {
  const path = moduleId.replace(/^\0/, '').replaceAll('\\', '/').split('?')[0] ?? ''
  const at = path.lastIndexOf(NODE_MODULES)
  if (at < 0) {
    return null
  }
  const [scope = '', name = ''] = path.slice(at + NODE_MODULES.length).split('/')
  const packageName = scope.startsWith('@') ? `${scope}/${name}` : scope
  return packageName ? path.slice(0, at + NODE_MODULES.length) + packageName : null
}

function readPackage(root: string): Component {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  return {
    name: pkg.name,
    version: pkg.version,
    license: typeof pkg.license === 'string' ? pkg.license : (pkg.license?.type ?? null),
    source: `https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}`,
    licenseFiles: readLicenseFiles(root, licenseFileNames(root))
  }
}

/** The npm packages whose code a build's chunks contain. */
export function bundledPackages(moduleIds: Iterable<string>): Component[] {
  const roots = new Set<string>()
  for (const id of moduleIds) {
    const root = packageRootOf(id)
    if (root) {
      roots.add(root)
    }
  }
  return uniqueSorted([...roots].map(readPackage))
}

/**
 * Every package the project's `dependencies` install, transitively.
 *
 * Why: the dev server bundles nothing, so it lists the runtime dependency tree instead. Optional
 * dependencies are left out: they are platform-specific Node binaries, never browser code.
 */
export function dependencyPackages(projectRoot: string): Component[] {
  const roots = new Set<string>()
  const pending = [projectRoot]
  for (let dir = pending.pop(); dir !== undefined; dir = pending.pop()) {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    for (const name of Object.keys(pkg.dependencies ?? {})) {
      const installed = findInstalled(dir, name)
      if (installed && !roots.has(installed)) {
        roots.add(installed)
        pending.push(installed)
      }
    }
  }
  return uniqueSorted([...roots].map(readPackage))
}

/**
 * The build tools that write code of their own into the output: Vite's preload helper, Rolldown's
 * module runtime and Tailwind's base styles. No chunk lists that code as a module.
 */
function outputToolPackages(projectRoot: string): Component[] {
  const vite = findInstalled(projectRoot, 'vite')
  const roots = [
    vite,
    vite ? findInstalled(vite, 'rolldown') : null,
    findInstalled(projectRoot, 'tailwindcss')
  ]
  return uniqueSorted(
    roots
      .filter((root) => root !== null)
      .map(readPackage)
      .map((tool) => ({
        ...tool,
        // Why: Vite's LICENSE.md goes on to list the Node-side packages Vite bundles into itself,
        // and none of those reach the output.
        licenseFiles: tool.licenseFiles.map((file) => ({
          ...file,
          text: file.text.split(/^# Licenses of bundled dependencies$/m)[0]!.trimEnd()
        }))
      }))
  )
}

// Node's lookup: `node_modules/<name>` in each ancestor that is not itself a node_modules folder.
function findInstalled(from: string, name: string): string | null {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name)
    if (basename(dir) !== 'node_modules' && existsSync(join(candidate, 'package.json'))) {
      return realpathSync(candidate)
    }
    if (dirname(dir) === dir) {
      return null
    }
  }
}

/** Why the split: a universal macOS build links one binary per architecture. */
export function crateTriples(triple: string): string[] {
  return triple === 'universal-apple-darwin'
    ? ['aarch64-apple-darwin', 'x86_64-apple-darwin']
    : [triple]
}

/**
 * The crates `manifestPath` links into its binary for `triples`, and the standard library.
 *
 * Why `cargo tree`: `cargo metadata` merges the features of build scripts and proc macros into
 * the resolve, which pulls in crates that only ever run on the build machine.
 */
function linkedCrates(manifestPath: string, triples: string[]): Component[] {
  const cargo = (args: string[]) =>
    // Why the cwd: rustup picks the toolchain from the repository's rust-toolchain.toml.
    execFileSync('cargo', args, {
      cwd: dirname(manifestPath),
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024
    })
  const targets = triples.flatMap((triple) => ['--target', triple])
  const tree = cargo([
    'tree',
    '--manifest-path',
    manifestPath,
    '--edges',
    'normal,no-proc-macro',
    ...targets,
    // Why: `tauri build` turns this feature on, and it decides how Tauri serves the frontend.
    '--features',
    'tauri/custom-protocol',
    '--prefix',
    'none',
    '--format',
    '{p}'
  ])
  const metadata = cargo([
    'metadata',
    '--format-version',
    '1',
    '--manifest-path',
    manifestPath,
    ...triples.flatMap((triple) => ['--filter-platform', triple])
  ])
  return [
    ...cratesFromTree(tree, JSON.parse(metadata) as CargoMetadata),
    rustStandardLibrary(dirname(manifestPath))
  ]
}

/** The packages `cargo tree --prefix none --format '{p}'` printed, without the root. */
export function cratesFromTree(tree: string, metadata: CargoMetadata): Component[] {
  const linked = new Set(
    tree.split('\n').flatMap((line) => {
      const match = /^(\S+) v(\S+)/.exec(line)
      return match ? [`${match[1]} ${match[2]}`] : []
    })
  )
  return uniqueSorted(
    metadata.packages
      .filter((pkg) => pkg.id !== metadata.resolve.root && linked.has(`${pkg.name} ${pkg.version}`))
      .map(crateComponent)
  )
}

// Why: every Rust binary links std, core and alloc, which no dependency graph lists.
function rustStandardLibrary(cwd: string): Component {
  const rustc = (args: string[]) => execFileSync('rustc', args, { cwd, encoding: 'utf8' }).trim()
  const docs = join(rustc(['--print', 'sysroot']), 'share/doc/rust')
  return {
    name: 'Rust standard library',
    version: /^release: (\S+)$/m.exec(rustc(['-vV']))?.[1] ?? '',
    license: 'MIT OR Apache-2.0',
    source: 'https://github.com/rust-lang/rust',
    licenseFiles: existsSync(docs) ? readLicenseFiles(docs, licenseFileNames(docs)) : []
  }
}

function crateComponent(pkg: CargoPackage): Component {
  const root = dirname(pkg.manifest_path)
  const names = licenseFileNames(root)
  const declared = pkg.license_file && normalize(pkg.license_file)
  if (declared && !names.includes(declared) && existsSync(join(root, declared))) {
    names.push(declared)
  }
  return {
    name: pkg.name,
    version: pkg.version,
    license: pkg.license,
    source: pkg.source?.includes('crates.io')
      ? `https://crates.io/crates/${pkg.name}/${pkg.version}`
      : pkg.repository,
    licenseFiles: readLicenseFiles(root, names)
  }
}

/** License files among a build's static files, one entry per folder they sit in. */
export function servedFileLicenses(publicDir: string): Component[] {
  const components: Component[] = []
  const pending = existsSync(publicDir) ? [publicDir] : []
  for (let dir = pending.pop(); dir !== undefined; dir = pending.pop()) {
    const entries = readdirSync(dir, { withFileTypes: true })
    pending.push(
      ...entries.filter((entry) => entry.isDirectory()).map(({ name }) => join(dir, name))
    )
    const names = licenseFileNames(dir)
    if (names.length) {
      const path = relative(publicDir, dir).replaceAll('\\', '/')
      components.push({
        name: path ? `${path}/` : '/',
        version: '',
        license: null,
        source: null,
        licenseFiles: readLicenseFiles(dir, names)
      })
    }
  }
  return components.sort((a, b) => compare(a.name, b.name))
}

function licenseFileNames(dir: string): string[] {
  return readdirSync(dir)
    .filter(
      (name) =>
        LICENSE_FILE.test(name) &&
        !NOT_LICENSE_TEXT.test(name) &&
        statSync(join(dir, name)).isFile()
    )
    .sort(compare)
}

function readLicenseFiles(dir: string, names: string[]): LicenseFile[] {
  return names
    .map((name) => ({
      name,
      text: readFileSync(join(dir, name), 'utf8')
        .replace(/\r\n?/g, '\n')
        .replace(/^\s*\n/, '')
        .trimEnd()
    }))
    .filter(({ text }) => text.trim())
}

// Why: pnpm installs a package once per peer set, and those copies are the same release.
function uniqueSorted(components: Component[]): Component[] {
  const byRelease = new Map(components.map((c) => [`${c.name}@${c.version}@${c.source}`, c]))
  return [...byRelease.values()].sort(
    (a, b) => compare(a.name, b.name) || a.version.localeCompare(b.version, 'en', { numeric: true })
  )
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function label(component: Component): string {
  return component.version ? `${component.name} ${component.version}` : component.name
}

/** Lists every component, then each distinct license text once with the components it covers. */
export function renderNotices(sections: NoticeSection[]): string {
  const lines = [
    'CanvaSlide third-party notices',
    '',
    'CanvaSlide includes the third-party software listed below: each entry gives the version,',
    'the declared license and where the source is published. The license texts the packages',
    'ship follow the lists, each naming the components it applies to.'
  ]
  const texts = new Map<string, string[]>()
  for (const { title, components } of sections) {
    if (!components.length) {
      continue
    }
    const heading = `${title} (${components.length})`
    lines.push('', heading, '-'.repeat(heading.length))
    for (const component of components) {
      const details = [
        component.license && `(${component.license})`,
        component.source,
        !component.licenseFiles.length && '- no license file in the package'
      ]
      lines.push([label(component), ...details].filter(Boolean).join(' '))
      for (const file of component.licenseFiles) {
        const users = texts.get(file.text) ?? []
        users.push(`${label(component)} (${file.name})`)
        texts.set(file.text, users)
      }
    }
  }
  lines.push('', 'License texts', '-------------')
  let index = 0
  for (const [text, users] of texts) {
    index += 1
    lines.push('', `=== License text ${index} ===`, 'Applies to:')
    lines.push(...users.map((user) => `  ${user}`), '', text)
  }
  return `${lines.join('\n')}\n`
}

function moduleIdsOf(bundle: Rolldown.OutputBundle): string[] {
  return Object.values(bundle).flatMap((entry) =>
    entry.type === 'chunk' ? Object.keys(entry.modules) : []
  )
}

/**
 * Writes `THIRD-PARTY-NOTICES.txt` into the build: the npm packages its chunks and workers
 * contain, the license files among its static files and, for `desktopTarget` (a Rust target
 * triple), the crates the desktop app links.
 *
 * Why: minified bundles and the compiled app drop the notices their licenses require us to ship.
 */
export function thirdPartyNotices(desktopTarget?: string): {
  plugin: Plugin
  worker: () => Plugin
} {
  const workerModules = new Set<string>()
  let publicDir = ''
  let base = '/'
  function notices(packages: Component[]): string {
    return renderNotices([
      {
        title: 'JavaScript packages',
        components: uniqueSorted([...packages, ...outputToolPackages(repoRoot)])
      },
      { title: 'Files served with the app', components: servedFileLicenses(publicDir) },
      {
        title: 'Rust crates in the desktop app',
        components: desktopTarget
          ? linkedCrates(resolve(repoRoot, 'src-tauri/Cargo.toml'), crateTriples(desktopTarget))
          : []
      }
    ])
  }
  return {
    plugin: {
      name: 'canvaslide:third-party-notices',
      configResolved(config) {
        publicDir = config.publicDir
        base = config.base
      },
      configureServer(server) {
        let text: string | undefined
        server.middlewares.use(`${base}${THIRD_PARTY_NOTICES_FILE}`, (_request, response, next) => {
          try {
            text ??= notices(dependencyPackages(repoRoot))
            response.setHeader('Content-Type', 'text/plain; charset=utf-8')
            response.end(text)
          } catch (error) {
            next(error)
          }
        })
      },
      generateBundle(_options, bundle) {
        this.emitFile({
          type: 'asset',
          fileName: THIRD_PARTY_NOTICES_FILE,
          source: notices(bundledPackages([...moduleIdsOf(bundle), ...workerModules]))
        })
      }
    },
    // Why: Vite bundles each worker in a build of its own that finishes before the page's.
    worker: () => ({
      name: 'canvaslide:third-party-notices-worker',
      generateBundle(_options, bundle) {
        for (const id of moduleIdsOf(bundle)) {
          workerModules.add(id)
        }
      }
    })
  }
}
