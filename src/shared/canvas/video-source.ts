export type VideoSource = {
  provider: 'youtube' | 'vimeo' | 'direct'
  url: string
  id?: string
  hash?: string
  start: number
}

function startSeconds(value: string | null): number {
  if (!value) {
    return 0
  }
  if (/^\d+(?:\.\d+)?s?$/.test(value)) {
    return Math.min(604800, Number.parseFloat(value))
  }
  const parts = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value)
  return parts
    ? Math.min(
        604800,
        Number(parts[1] ?? 0) * 3600 + Number(parts[2] ?? 0) * 60 + Number(parts[3] ?? 0)
      )
    : 0
}

/** Explicit insertion accepts extensionless media; paste only recognizes known video links. */
export function parseVideoSource(raw: string, explicit = false): VideoSource | null {
  const text = raw.trim()
  if (
    !text ||
    /\s/u.test(text) ||
    text.split('').some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  ) {
    return null
  }
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    return null
  }
  const host = url.hostname.toLowerCase()
  const path = url.pathname.split('/').filter(Boolean)
  const start = startSeconds(
    url.searchParams.get('start') ??
      url.searchParams.get('t') ??
      new URLSearchParams(url.hash.slice(1)).get('t')
  )
  if (
    [
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
      'music.youtube.com',
      'youtu.be',
      'www.youtube-nocookie.com',
      'youtube-nocookie.com'
    ].includes(host)
  ) {
    if (url.port) {
      return null
    }
    const id =
      host === 'youtu.be'
        ? path[0]
        : path[0] === 'watch'
          ? url.searchParams.get('v')
          : ['embed', 'shorts', 'live'].includes(path[0] ?? '')
            ? path[1]
            : null
    if (!id || !/^[\w-]{11}$/.test(id)) {
      return null
    }
    return {
      provider: 'youtube',
      id,
      start,
      url: `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ''}`
    }
  }
  if (['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(host)) {
    if (url.port) {
      return null
    }
    const match =
      /^\/(?:video\/|channels\/[^/]+\/|groups\/[^/]+\/videos\/)?(\d+)(?:\/([a-zA-Z0-9]+))?\/?$/.exec(
        url.pathname
      )
    if (!match) {
      return null
    }
    const id = match[1]!
    const hash = url.searchParams.get('h') ?? match[2]
    if (hash && !/^[a-zA-Z0-9]+$/.test(hash)) {
      return null
    }
    return {
      provider: 'vimeo',
      id,
      ...(hash ? { hash } : {}),
      start,
      url: `https://vimeo.com/${id}${hash ? `/${hash}` : ''}${start ? `#t=${start}s` : ''}`
    }
  }
  if (!explicit && !/\.(mp4|webm|ogv|ogg|mov|m4v)$/i.test(url.pathname)) {
    return null
  }
  return { provider: 'direct', url: text, start: 0 }
}

export function videoEmbedUrl(source: VideoSource, muted: boolean, origin: string): string {
  if (source.provider === 'direct') {
    return source.url
  }
  if (source.provider === 'youtube') {
    const url = new URL(`https://www.youtube.com/embed/${source.id}`)
    url.search = new URLSearchParams({
      enablejsapi: '1',
      autoplay: '0',
      playsinline: '1',
      controls: '1',
      origin,
      start: String(source.start),
      mute: muted ? '1' : '0'
    }).toString()
    return url.href
  }
  const url = new URL(`https://player.vimeo.com/video/${source.id}`)
  url.search = new URLSearchParams({
    autoplay: '0',
    muted: muted ? '1' : '0',
    playsinline: '1',
    autopause: '0',
    ...(source.hash ? { h: source.hash } : {})
  }).toString()
  if (source.start) {
    url.hash = `t=${source.start}s`
  }
  return url.href
}
