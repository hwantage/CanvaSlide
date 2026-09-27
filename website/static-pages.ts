import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { runnerImport, type Plugin, type ResolvedConfig } from 'vite'
import type * as ServerEntry from './src/entry-server'

/** Reuse the client build's template/assets; render the same components before hydration. */
export function staticPages(): Plugin {
  let config: ResolvedConfig
  return {
    name: 'canvaslide:static-pages',
    configResolved(resolved) {
      config = resolved
    },
    async closeBundle() {
      if (config.command !== 'build') {
        return
      }
      const output = resolve(config.root, config.build.outDir)
      const template = await readFile(resolve(output, 'index.html'), 'utf8')
      const { module } = await runnerImport<typeof ServerEntry>(
        resolve(config.root, 'src/entry-server.tsx'),
        {
          configFile: false,
          root: config.root,
          base: config.base,
          mode: config.mode,
          envDir: config.envDir,
          resolve: { alias: config.resolve.alias },
          logLevel: 'warn'
        }
      )
      for (const page of module.renderPages()) {
        const file = resolve(output, page.path, 'index.html')
        await mkdir(dirname(file), { recursive: true })
        await writeFile(
          file,
          template
            .replace('lang="en"', `lang="${page.locale}"`)
            .replace('<!--site-head-->', () => page.head)
            .replace('<div id="root"></div>', () => `<div id="root">${page.body}</div>`)
        )
      }
      await writeFile(resolve(output, 'sitemap.xml'), module.renderSitemap())
    }
  }
}
