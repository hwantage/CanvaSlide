import type { Locale } from './translator'

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

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
