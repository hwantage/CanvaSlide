export type Locale = 'en' | 'ko'
type Params = Record<string, string | number>

// Why: a generic parameter is needed for the conditional to distribute over the key union.
type PluralBase<K, Key> = K extends `${infer Base}.one`
  ? `${Base}.other` extends Key
    ? Base
    : never
  : never
/** Keys that come in `.one` / `.other` pairs, addressed by their base for `tn()`. */
export type PluralKey<Key extends string> = PluralBase<Key, Key>

export type Translator<Key extends string> = {
  t: (key: Key, params?: Params) => string
  /** Picks `${key}.one` for exactly one, `${key}.other` otherwise; `{n}` is filled with the count. */
  tn: (key: PluralKey<Key>, count: number, params?: Params) => string
}

export function interpolate(template: string, params?: Params): string {
  if (!params) {
    return template
  }
  return template.replaceAll(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  )
}

/** Reads `tables[locale()]` on every call, so strings follow the host's current language. */
export function createTranslator<Key extends string>(
  tables: Record<Locale, Record<Key, string>>,
  locale: () => Locale
): Translator<Key> {
  const t = (key: Key, params?: Params) => interpolate(tables[locale()][key], params)
  const tn = (key: PluralKey<Key>, count: number, params?: Params) =>
    t(`${key}.${count === 1 ? 'one' : 'other'}` as Key, { n: count, ...params })
  return { t, tn }
}
