import css from './player.css?inline'
import videoCss from '@shared/media/linked-video.css?inline'
import type { CanvasDocument } from '@shared/canvas/element-types'
import presentationCss from '@shared/presentation/presentation.css?inline'
import presentationTokens from '@shared/presentation/presentation-tokens.css?inline'
import { mountPresentationExperience } from '@shared/presentation/presentation-experience'
import { renderDocument } from './player-dom'
import { createPlayerPresentation } from './player-presentation'

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

function mount(): void {
  const style = document.createElement('style')
  style.textContent = presentationTokens + css + videoCss + presentationCss
  document.head.append(style)

  const doc = readDocument()
  document.title = `${doc.name} — CanvaSlide`

  const viewport = document.createElement('div')
  viewport.className = 'uc-viewport'
  viewport.dataset.testid = 'canvas-viewport'
  const stage = document.createElement('div')
  stage.className = 'uc-stage'
  stage.dataset.testid = 'presentation-stage'
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
  let disposeExperience: (() => void) | undefined
  if (frameNodes.length > 0) {
    disposeExperience = mountPresentationExperience(
      viewport,
      {
        getState: () => ({
          index: presentation.index,
          count: presentation.count,
          overview: presentation.overview,
          frameId: presentation.frames[presentation.index]?.id ?? null,
          name: presentation.frames[presentation.index]?.name ?? ''
        }),
        getView: presentation.getView,
        subscribeState: presentation.onChange,
        subscribeView: presentation.onViewChange,
        next: presentation.next,
        previous: presentation.previous,
        toggleOverview: presentation.toggleOverview
      },
      {
        controls: 'Slide Show',
        toggleOverview: 'Overview (O)',
        previous: 'Previous frame (←)',
        next: 'Next frame (→)',
        togglePointer: 'Laser pointer — drag to draw (P)',
        clearInk: 'Erase all ink (E)',
        tools: 'Tools',
        exit: 'Exit presentation (Esc)'
      }
    ).dispose
  } else {
    const empty = document.createElement('div')
    empty.className = 'uc-empty'
    empty.textContent = 'This board has no presentation frames.'
    viewport.append(empty)
  }
  const resize = new ResizeObserver(() => presentation.resize())
  resize.observe(viewport)
  // A bfcache restore resumes the intact session; permanent page teardown releases every binding.
  window.addEventListener('pagehide', (event) => {
    if (event.persisted) {
      return
    }
    resize.disconnect()
    disposeExperience?.()
    presentation.dispose()
  })
  presentation.start()
}

mount()
