import css from './player.css?inline'
import videoCss from '@shared/media/linked-video.css?inline'
import type { CanvasDocument } from '@shared/canvas/element-types'
import { presentationKeyAction } from '@shared/canvas/presentation-keys'
import { renderDocument } from './player-dom'
import { createPlayerPresentation, type PlayerPresentation } from './player-presentation'

/**
 * Standalone player entry. The exported HTML embeds the document as
 * <script id="canvas-document" type="application/json"> and this bundle right after it.
 */

function readDocument(): CanvasDocument {
  const holder = document.getElementById('canvas-document')
  if (!holder?.textContent) {
    throw new Error('Missing embedded canvas document')
  }
  return JSON.parse(holder.textContent) as CanvasDocument
}

function buildNav(presentation: PlayerPresentation): HTMLElement {
  const nav = document.createElement('div')
  nav.className = 'uc-nav'
  const bar = document.createElement('div')
  bar.className = 'uc-nav-bar'
  const button = (label: string, text: string, onClick: () => void) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.title = label
    b.setAttribute('aria-label', label)
    b.textContent = text
    b.addEventListener('click', onClick)
    return b
  }
  const overviewButton = button('Overview (O)', '▦', presentation.toggleOverview)
  const prev = button('Previous frame (←)', '‹', presentation.previous)
  const next = button('Next frame (→)', '›', presentation.next)
  const counter = document.createElement('div')
  counter.className = 'uc-counter'
  counter.dataset.testid = 'presentation-counter'
  const sync = () => {
    const name = presentation.frames[presentation.index]?.name ?? ''
    counter.textContent = `${presentation.index + 1} / ${presentation.count}`
    const span = document.createElement('span')
    span.textContent = name
    counter.append(span)
    prev.disabled = presentation.index === 0 && !presentation.overview
    next.disabled = presentation.index >= presentation.count - 1 && !presentation.overview
    overviewButton.setAttribute('aria-pressed', String(presentation.overview))
  }
  presentation.onChange(sync)
  sync()
  bar.append(overviewButton, prev, counter, next)
  nav.append(bar)
  return nav
}

function bindKeyboard(presentation: PlayerPresentation): void {
  window.addEventListener('keydown', (event) => {
    switch (presentationKeyAction(event.key)) {
      case 'next':
        presentation.next()
        break
      case 'previous':
        presentation.previous()
        break
      case 'toggleOverview':
        presentation.toggleOverview()
        break
      case 'escape':
        // Why: there is no editor to go back to; Escape only leaves the overview.
        if (presentation.overview) {
          presentation.goTo(presentation.index)
        }
        break
      case null:
        return
    }
    event.preventDefault()
  })
}

function mount(): void {
  const style = document.createElement('style')
  style.textContent = css + videoCss
  document.head.append(style)

  const doc = readDocument()
  document.title = `${doc.name} — CanvaSlide`

  const viewport = document.createElement('div')
  viewport.className = 'uc-viewport'
  viewport.dataset.testid = 'canvas-viewport'
  const stage = document.createElement('div')
  stage.className = 'uc-stage'
  const world = document.createElement('div')
  world.className = 'uc-world'
  world.dataset.testid = 'world-layer'
  const zoomLayer = document.createElement('div')
  zoomLayer.className = 'uc-zoom'
  const spotlight = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  spotlight.setAttribute('class', 'uc-spot')
  spotlight.setAttribute('aria-hidden', 'true')
  const spotlightPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  spotlightPath.setAttribute('fill-rule', 'evenodd')
  spotlightPath.setAttribute('fill', '#000')
  spotlightPath.setAttribute('fill-opacity', '0')
  spotlight.append(spotlightPath)
  world.append(zoomLayer)
  stage.append(world, spotlight)
  viewport.append(stage)
  document.body.append(viewport)

  const { frameNodes } = renderDocument(doc, zoomLayer)
  const presentation = createPlayerPresentation(doc, {
    viewport,
    stage,
    world,
    zoomLayer,
    spotlight,
    spotlightPath,
    frameNodes
  })
  for (const { node, index } of frameNodes) {
    node.addEventListener('click', () => presentation.goTo(index))
  }
  if (frameNodes.length > 0) {
    viewport.append(buildNav(presentation))
  } else {
    const empty = document.createElement('div')
    empty.className = 'uc-empty'
    empty.textContent = 'This board has no presentation frames.'
    viewport.append(empty)
  }
  bindKeyboard(presentation)
  new ResizeObserver(() => presentation.refit()).observe(viewport)
  presentation.start()
}

mount()
