import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Locale } from './translator'

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort()

/** Problems the key type cannot catch, shared by the app's and the website's table tests. */
export function stringTableProblems(tables: Record<Locale, Record<string, string>>): string[] {
  const { en: source } = tables
  const problems: string[] = []
  for (const [locale, strings] of Object.entries(tables)) {
    for (const [key, value] of Object.entries(strings)) {
      if (value.trim() === '') {
        problems.push(`${locale}:${key} is empty`)
      }
      if (placeholders(value).join() !== placeholders(source[key] ?? '').join()) {
        problems.push(`${locale}:${key} has placeholders that differ from English`)
      }
    }
  }
  for (const key of Object.keys(source)) {
    if (key.endsWith('.one') && !(key.replace(/\.one$/, '.other') in source)) {
      problems.push(`${key} has no .other form`)
    }
  }
  return problems
}

/** Keys no non-test source names literally, by tn() base key or as a whole template literal. */
export function unusedKeys(keys: readonly string[], sourceDirs: readonly string[]): string[] {
  const sources = sourceDirs
    .flatMap((dir) =>
      readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$|(^|[\\/])locales[\\/]/.test(file))
        .map((file) => readFileSync(join(dir, file), 'utf8'))
    )
    .join('\n')
  // site.docs.${id}.title keeps only the .title keys under site.docs, not the whole namespace.
  const templates = [...sources.matchAll(/`([A-Za-z][\w.-]*\.(?:\$\{[^{}`]*\}[\w.-]*)+)`/g)].map(
    (m) =>
      new RegExp(
        `^${m[1]!
          .split(/\$\{[^{}`]*\}/)
          .map((part) => part.replaceAll('.', '\\.'))
          .join('[\\w-]+')}$`
      )
  )
  const named = (key: string) => ["'", '"', '`'].some((q) => sources.includes(`${q}${key}${q}`))
  return keys.filter(
    (key) =>
      !named(key) &&
      !named(key.replace(/\.(one|other)$/, '')) &&
      !templates.some((template) => template.test(key))
  )
}
