/** Numeric parts of a `v1.2.3` / `1.2.3-beta.1` version; missing parts count as 0. */
export function parseVersion(version: string): number[] | null {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(version.trim())
  if (!match) {
    return null
  }
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)]
}

/** True when `candidate` is strictly newer than `current`; malformed input is never newer. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = parseVersion(candidate)
  const b = parseVersion(current)
  if (!a || !b) {
    return false
  }
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) {
      return (a[i] ?? 0) > (b[i] ?? 0)
    }
  }
  return false
}
