import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import {
  exampleAssetPath,
  exampleCatalog,
  MAX_EXAMPLE_BYTES
} from '../src/shared/example-catalog.ts'

// Both deployments publish the same sources; generated copies never need to be committed.
export function exampleAssets(): Plugin {
  const root = resolve(import.meta.dirname, '..')
  const sources = new Map<string, string>(
    exampleCatalog.map((example) => [exampleAssetPath(example.id), example.source])
  )
  const manifest = JSON.stringify(
    exampleCatalog.map(({ id }) => ({ id, file: exampleAssetPath(id) }))
  )
  let base = '/'
  async function assetContents(source: string) {
    return readFile(resolve(root, 'examples', source))
  }
  return {
    name: 'canvaslide:example-assets',
    configResolved(config) {
      base = config.base
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        const path = pathname.startsWith(base) ? pathname.slice(base.length) : ''
        const source = sources.get(path)
        if (!source && path !== 'examples/catalog.json') {
          next()
          return
        }
        try {
          const data = source ? await assetContents(source) : manifest
          response.setHeader('Content-Type', 'application/json; charset=utf-8')
          response.setHeader('X-Content-Type-Options', 'nosniff')
          response.end(data)
        } catch (error) {
          next(error)
        }
      })
    },
    async generateBundle() {
      for (const [fileName, source] of sources) {
        const contents = await assetContents(source)
        if (contents.byteLength > MAX_EXAMPLE_BYTES) {
          this.error(`${source} exceeds the Cloudflare Pages 25 MiB file limit`)
        }
        this.emitFile({
          type: 'asset',
          fileName,
          source: contents
        })
      }
      this.emitFile({ type: 'asset', fileName: 'examples/catalog.json', source: manifest })
    }
  }
}
