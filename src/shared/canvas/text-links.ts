/**
 * Web links of text elements: the element's `link` and the http(s) URLs written in its text. The
 * editor, the HTML player and the document schema share these rules, so no schema runtime here.
 */

/** The longest link a document keeps; browsers and servers commonly stop near 2 000 characters. */
export const MAX_WEB_LINK_LENGTH = 2048

// Why: an ASCII run, so Hangul written right after a URL (a particle such as 에서) ends it. A query,
// a fragment or a path that already has a segment (…/wiki/서울) goes on in any script up to
// whitespace or punctuation. `<`, `>`, `"` and backticks never belong to a URL written in prose.
const URL_IN_TEXT = /\bhttps?:\/\/[!#-;=?-_a-~]+/gi
const URL_CONTINUATION = /[\p{L}\p{N}\p{M}!#-;=?-_a-~]*/uy
const WORD_CHARACTER = /[\p{L}\p{N}\p{M}]/uy
const TRAILING_PUNCTUATION = ".,;:!?'*~"
const CLOSING_BRACKETS: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
const SCHEME = /^[a-z][a-z0-9+.-]*:/i
// `localhost:3000` looks like a scheme followed by a port.
const HOST_WITH_PORT = /^[^:/]+:\d/

export type TextLinkSegment = { text: string; url?: string }

/** Class of every text link in the editor and in exported HTML, for styles and tests. */
export const TEXT_LINK_CLASS = 'uc-link'

/** `new URL` drops these silently, so a stored link holding one would differ from what opens. */
function hasSpaceOrControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x20 || code === 0x7f) {
      return true
    }
  }
  return false
}

/** True for an absolute http(s) URL with a host: the only links a document may hold. */
export function isWebLink(value: string): boolean {
  if (value.length > MAX_WEB_LINK_LENGTH || hasSpaceOrControl(value)) {
    return false
  }
  try {
    const url = new URL(value)
    // An http(s) URL without a host does not parse, so the protocol settles it.
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** The link to store for what a user typed, or null; no scheme means https, as in an address bar. */
export function normalizeWebLink(input: string): string | null {
  const text = input.trim()
  if (text === '' || /\s/.test(text)) {
    return null
  }
  const absolute = SCHEME.test(text) && !HOST_WITH_PORT.test(text) ? text : `https://${text}`
  if (!isWebLink(absolute)) {
    return null
  }
  const href = new URL(absolute).href
  return href.length <= MAX_WEB_LINK_LENGTH ? href : null
}

/** Drops sentence punctuation and unmatched closing brackets that end a URL written in prose. */
function trimUrl(candidate: string): string {
  // Why: bracket counts are taken once and kept current, so a long run of `)` stays linear.
  const brackets: Record<string, number> = { '(': 0, ')': 0, '[': 0, ']': 0, '{': 0, '}': 0 }
  for (const character of candidate) {
    if (character in brackets) {
      brackets[character]! += 1
    }
  }
  let end = candidate.length
  while (end > 0) {
    const last = candidate[end - 1]!
    const opening = CLOSING_BRACKETS[last]
    if (opening !== undefined && brackets[last]! > brackets[opening]!) {
      brackets[last]! -= 1
    } else if (!TRAILING_PUNCTUATION.includes(last)) {
      break
    }
    end -= 1
  }
  return candidate.slice(0, end)
}

/**
 * What an ASCII run cut by a letter in another script means: a host cut after `.` or `-` is no
 * URL at all (`news.네이버.com`); a query, fragment or segmented path goes on; anything else ends.
 */
function cutUrl(run: string): 'drop' | 'continue' | 'end' {
  const rest = run.slice(run.indexOf('//') + 2)
  const pathStart = rest.search(/[/?#]/)
  if (pathStart === -1) {
    return /[.-]$/.test(rest) ? 'drop' : 'end'
  }
  const path = rest.slice(pathStart)
  return /[?#]/.test(path) || (path.length > 1 && path.endsWith('/')) ? 'continue' : 'end'
}

/** The text split into plain runs and the http(s) URLs it contains, in order. */
export function textLinkSegments(text: string): TextLinkSegment[] {
  const segments: TextLinkSegment[] = []
  let from = 0
  // Why: text a candidate took in is never scanned again, so the scan stays linear in the text.
  let scanned = 0
  for (const match of text.matchAll(URL_IN_TEXT)) {
    if (match.index < scanned) {
      continue
    }
    let candidate = match[0]
    const end = match.index + candidate.length
    WORD_CHARACTER.lastIndex = end
    if (WORD_CHARACTER.test(text)) {
      const cut = cutUrl(candidate)
      if (cut === 'drop') {
        scanned = end
        continue
      }
      if (cut === 'continue') {
        URL_CONTINUATION.lastIndex = end
        candidate += URL_CONTINUATION.exec(text)?.[0] ?? ''
      }
    }
    scanned = match.index + candidate.length
    const url = trimUrl(candidate)
    if (!isWebLink(url)) {
      continue
    }
    if (match.index > from) {
      segments.push({ text: text.slice(from, match.index) })
    }
    segments.push({ text: url, url })
    from = match.index + url.length
  }
  if (from < text.length) {
    segments.push({ text: text.slice(from) })
  }
  return segments
}

/** A cheap test for whether a text can draw a link, so only such texts react to presenting. */
export function mayHaveTextLinks(text: string, link: string | undefined): boolean {
  return link !== undefined || /https?:\/\//i.test(text)
}

/** What a text element draws: its whole text as one link when it has `link`, else the URLs in it. */
export function textElementSegments(text: string, link: string | undefined): TextLinkSegment[] {
  if (link === undefined) {
    return textLinkSegments(text)
  }
  return text === '' ? [] : [{ text, url: link }]
}
