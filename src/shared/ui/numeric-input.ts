/** Parses a typed number field: empty/partial input yields null so the caller keeps the old value. */
export function parseBoundedNumber(raw: string, min: number, max: number): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return null
  }
  const value = Number(trimmed)
  if (!Number.isFinite(value)) {
    return null
  }
  return Math.min(max, Math.max(min, value))
}
