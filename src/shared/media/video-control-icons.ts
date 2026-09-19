const paths = {
  play: ['m9 5 12 7-12 7V5Z'],
  pause: ['M8 5v14', 'M16 5v14'],
  resume: ['m9 5 12 7-12 7V5Z'],
  expand: ['M8 3H3v5', 'M16 3h5v5', 'M21 16v5h-5', 'M3 16v5h5'],
  collapse: ['M3 8h5V3', 'M16 3v5h5', 'M21 16h-5v5', 'M8 21v-5H3'],
  sound: ['m11 5-6 4H2v6h3l6 4V5Z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M19 5a10 10 0 0 1 0 14'],
  mute: ['m11 5-6 4H2v6h3l6 4V5Z', 'm17 9 5 6', 'm22 9-5 6'],
  retry: ['M3 10a9 9 0 1 1 2.7 8.4', 'M3 4v6h6'],
  open: ['M15 3h6v6', 'm10 14 11-11', 'M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5']
}
export type VideoControlIcon = keyof typeof paths

/** Shared SVG strokes match the editor's icon weight without bringing React into HTML exports. */
export function videoControlIcon(name: VideoControlIcon): SVGSVGElement {
  const namespace = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(namespace, 'svg')
  for (const [key, value] of Object.entries({
    viewBox: '0 0 24 24',
    width: '16',
    height: '16',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.75',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false'
  })) {
    svg.setAttribute(key, value)
  }
  for (const d of paths[name]) {
    const path = document.createElementNS(namespace, 'path')
    path.setAttribute('d', d)
    svg.append(path)
  }
  return svg
}

export function labelVideoControl(
  button: HTMLButtonElement,
  label: string,
  icon: VideoControlIcon
) {
  button.title = label
  button.setAttribute('aria-label', label)
  button.replaceChildren(videoControlIcon(icon))
  if (icon === 'play') {
    const text = document.createElement('span')
    text.textContent = label
    button.append(text)
  }
}
