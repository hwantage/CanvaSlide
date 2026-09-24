import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { runnerImport, type Plugin } from 'vite'
import type * as ConnectorGeometry from '../src/shared/canvas/connector-geometry.ts'
import type * as DocumentFile from '../src/shared/canvas/document-file.ts'
import type * as HtmlExport from '../src/shared/canvas/html-export.ts'
import { findExample, type ExampleId } from '../src/shared/example-catalog.ts'

const root = resolve(import.meta.dirname, '..')
const playerPath = resolve(root, 'src/renderer/src/generated/player.iife.js')

type ExportModules = [typeof DocumentFile, typeof ConnectorGeometry, typeof HtmlExport]
let exportModules: Promise<ExportModules> | undefined

// Why through Vite: Node and the config loader reject the shared modules' extensionless imports.
function loadExportModules(): Promise<ExportModules> {
  const load = <T>(path: string) =>
    runnerImport<T>(resolve(root, path), { configFile: false, root, logLevel: 'warn' }).then(
      ({ module }) => module
    )
  exportModules ??= Promise.all([
    load<typeof DocumentFile>('src/shared/canvas/document-file.ts'),
    load<typeof ConnectorGeometry>('src/shared/canvas/connector-geometry.ts'),
    load<typeof HtmlExport>('src/shared/canvas/html-export.ts')
  ])
  return exportModules
}

export function exampleExportPath(id: ExampleId): string {
  return `examples/${id}.html`
}

/** The browser editor's HTML export of an example at original quality, with the current player. */
export async function exampleExportHtml(id: ExampleId): Promise<string> {
  const example = findExample(id)
  if (!example) {
    throw new Error(`Unknown example ${id}`)
  }
  const [{ parseDocumentFile }, { syncConnectorGeometry }, { buildStandaloneHtml }] =
    await loadExportModules()
  const parsed = parseDocumentFile(await readFile(resolve(root, 'examples', example.source)))
  if (!parsed.ok) {
    throw new Error(`${example.source}: ${parsed.error}`)
  }
  const playerScript = await readFile(playerPath, 'utf8').catch((error: unknown) => {
    throw new Error(`${playerPath} is missing; run \`pnpm build:player\` first`, { cause: error })
  })
  // Why sync: the editor re-resolves attached connector ends on load, so its exports never lag.
  return buildStandaloneHtml({ document: syncConnectorGeometry(parsed.document), playerScript })
}

// Why generated: a committed export silently keeps whatever player existed when it was made.
export function exampleExports(ids: readonly ExampleId[]): Plugin {
  const paths = new Map<string, ExampleId>(ids.map((id) => [exampleExportPath(id), id]))
  let base = '/'
  return {
    name: 'canvaslide:example-exports',
    configResolved(config) {
      base = config.base
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        const id = paths.get(pathname.startsWith(base) ? pathname.slice(base.length) : '')
        if (!id) {
          next()
          return
        }
        try {
          const html = await exampleExportHtml(id)
          response.setHeader('Content-Type', 'text/html; charset=utf-8')
          response.end(html)
        } catch (error) {
          next(error)
        }
      })
    },
    async generateBundle() {
      for (const [fileName, id] of paths) {
        this.emitFile({ type: 'asset', fileName, source: await exampleExportHtml(id) })
      }
    }
  }
}
