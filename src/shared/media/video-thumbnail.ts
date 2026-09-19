/** Thumbnails identify idle videos without loading an iframe or persisting image bytes. */
export function showYouTubeThumbnail(surface: HTMLElement, id: string, label: string): void {
  const fallback = document.createElement('span')
  fallback.textContent = 'YouTube'
  const thumbnail = document.createElement('img')
  thumbnail.className = 'linked-video-thumbnail'
  thumbnail.alt = label
  thumbnail.draggable = false
  thumbnail.decoding = 'async'
  thumbnail.referrerPolicy = 'no-referrer'
  thumbnail.hidden = true
  let highResolution = true
  const unavailable = () => {
    if (thumbnail.parentElement !== surface) {
      return
    }
    if (highResolution) {
      highResolution = false
      thumbnail.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
    } else {
      thumbnail.remove()
    }
  }
  thumbnail.onerror = unavailable
  thumbnail.onload = () => {
    if (thumbnail.parentElement !== surface) {
      return
    }
    if (thumbnail.naturalWidth <= 120) {
      unavailable()
      return
    }
    fallback.remove()
    thumbnail.hidden = false
  }
  surface.replaceChildren(fallback, thumbnail)
  thumbnail.src = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`
}
