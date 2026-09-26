// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import { parseSync } from 'vite'
import { expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const renderer = resolve(root, 'src/renderer/src')
const dependencies = new Map<string, string[]>()

function runtimeImports(file: string, source: string): string[] {
  const parsed = parseSync(file, source)
  expect(parsed.errors, relative(root, file)).toEqual([])
  return parsed.program.body.flatMap((node) => {
    if (node.type === 'ImportDeclaration') {
      if (node.importKind === 'type') {
        return []
      }
      if (
        node.specifiers.length > 0 &&
        node.specifiers.every((s) => s.type === 'ImportSpecifier' && s.importKind === 'type')
      ) {
        return []
      }
      return [node.source.value]
    }
    if (node.type === 'ExportAllDeclaration' || node.type === 'ExportNamedDeclaration') {
      if (node.exportKind === 'type' || !node.source) {
        return []
      }
      if (
        node.type === 'ExportNamedDeclaration' &&
        node.specifiers.length > 0 &&
        node.specifiers.every((s) => s.exportKind === 'type')
      ) {
        return []
      }
      return [node.source.value]
    }
    return []
  })
}

function imports(file: string): string[] {
  const cached = dependencies.get(file)
  if (cached) {
    return cached
  }
  const sources = runtimeImports(file, readFileSync(file, 'utf8'))
  const targets = sources.flatMap((source) => {
    const base = source.startsWith('@/')
      ? resolve(renderer, source.slice(2))
      : source.startsWith('@shared/')
        ? resolve(root, 'src/shared', source.slice(8))
        : source.startsWith('.')
          ? resolve(dirname(file), source)
          : null
    if (!base) {
      return []
    }
    const target = [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      `${base}/index.ts`,
      `${base}/index.tsx`
    ].find((candidate) => /\.tsx?$/.test(candidate) && existsSync(candidate))
    return target ? [target] : []
  })
  dependencies.set(file, targets)
  return targets
}

function pathTo(start: string, target: string): string[] | null {
  const visited = new Set<string>()
  function visit(file: string): string[] | null {
    if (visited.has(file)) {
      return null
    }
    visited.add(file)
    for (const dependency of imports(file)) {
      if (dependency === target) {
        return [file, target]
      }
      const path = visit(dependency)
      if (path) {
        return [file, ...path]
      }
    }
    return null
  }
  return visit(start)?.map((file) => relative(root, file)) ?? null
}

it.each(['cloud-share-store', 'example-store', 'camera-store'])(
  '%s has no static runtime import path back to itself',
  (name) => {
    const file = resolve(renderer, 'store', `${name}.ts`)
    expect(pathTo(file, file)).toBeNull()
  }
)

it('camera-store cannot read document-store through its preparation dependency', () => {
  expect(
    pathTo(resolve(renderer, 'store/camera-store.ts'), resolve(renderer, 'store/document-store.ts'))
  ).toBeNull()
})

it('keeps empty runtime re-exports while excluding type-only dependencies', () => {
  expect(
    runtimeImports(
      'boundary-fixture.ts',
      `
    export {} from './document-store'
    export { type Document } from './types'
    import './side-effect'
    import type { Camera } from './types'
  `
    )
  ).toEqual(['./document-store', './side-effect'])
})
