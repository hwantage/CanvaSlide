import type { AnnotationSession } from './presentation-annotation-state'
import { inkPointSpacing, presentationWorldPoint } from './presentation-ink'
import type { PresentationHost } from './presentation-host'
import { ownsPresentationPointer } from './presentation-input'
import { createInkPainter } from './presentation-ink-painter'

export function mountPresentationAnnotations(
  viewport: HTMLElement,
  host: PresentationHost,
  session: AnnotationSession
) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', 'presentation-ink')
  svg.setAttribute('aria-hidden', 'true')
  svg.dataset.testid = 'presentation-ink'
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  svg.append(group)
  const laser = document.createElement('div')
  laser.className = 'presentation-laser-layer'
  laser.dataset.testid = 'laser-pointer-layer'
  laser.setAttribute('aria-hidden', 'true')
  viewport.append(svg, laser)
  const painter = createInkPainter(group)
  let dot: HTMLDivElement | null = null
  let drawing: number | null = null
  let origin = viewport.getBoundingClientRect()
  const measure = () => {
    origin = viewport.getBoundingClientRect()
  }
  const finish = () => {
    drawing = null
    painter.end()
  }
  let view = host.getView()
  const paintView = () => {
    view = host.getView()
    const { camera, viewport: size, roll } = view
    group.setAttribute(
      'transform',
      `rotate(${roll} ${size.width / 2} ${size.height / 2}) translate(${camera.x} ${camera.y}) scale(${camera.zoom})`
    )
  }
  const unsubscribeView = host.subscribeView(paintView)
  paintView()
  const sync = () => {
    const { pointing } = session.getState()
    viewport.dataset.presentationPointing = String(pointing)
    if (pointing && !dot) {
      dot = document.createElement('div')
      dot.className = 'laser-pointer'
      dot.dataset.testid = 'laser-pointer'
      dot.style.opacity = '0'
      laser.append(dot)
    } else if (!pointing) {
      finish()
      dot?.remove()
      dot = null
    }
  }
  sync()
  const unsubscribeAnnotation = session.subscribe((state, previous) => {
    if (state.clearCount !== previous.clearCount) {
      finish()
      painter.clear()
    }
    sync()
  })
  const worldAt = (event: PointerEvent) => {
    const { camera, viewport: size, roll } = view
    return presentationWorldPoint(
      { x: event.clientX - origin.left, y: event.clientY - origin.top },
      camera,
      size,
      roll
    )
  }
  const sample = (event: PointerEvent, released = false) =>
    painter.extend(worldAt(event), released ? Number.EPSILON : inkPointSpacing(view.camera.zoom))
  const abort = new AbortController()
  const options = { capture: true, signal: abort.signal }
  window.addEventListener(
    'pointerdown',
    (event) => {
      if (!event.isPrimary) {
        finish()
        return
      }
      if (
        !session.getState().pointing ||
        host.isInputBlocked?.() ||
        host.getState().overview ||
        event.button !== 0 ||
        drawing !== null ||
        !(event.target instanceof Node) ||
        !viewport.contains(event.target) ||
        ownsPresentationPointer(event.target)
      ) {
        return
      }
      measure()
      drawing = event.pointerId
      painter.begin(worldAt(event))
      event.preventDefault()
    },
    options
  )
  viewport.addEventListener(
    'touchstart',
    (event) => {
      // Cancel native touch handling only after the pointer handler has claimed an ink stroke.
      if (
        drawing !== null &&
        event.cancelable &&
        event.target instanceof Node &&
        !ownsPresentationPointer(event.target)
      ) {
        event.preventDefault()
      }
    },
    { ...options, passive: false }
  )
  window.addEventListener(
    'pointermove',
    (event) => {
      if (dot && event.isPrimary) {
        dot.style.transform = `translate3d(${event.clientX - origin.left}px, ${event.clientY - origin.top}px, 0)`
        dot.style.opacity = '1'
      }
      if (event.pointerId !== drawing) {
        return
      }
      if ((event.buttons & 1) === 0 || host.isInputBlocked?.()) {
        finish()
        return
      }
      sample(event)
    },
    options
  )
  window.addEventListener(
    'pointerup',
    (event) => {
      if (event.pointerId !== drawing) {
        return
      }
      sample(event, true)
      finish()
    },
    options
  )
  const cancel = (event: PointerEvent) => {
    if (event.pointerId === drawing) {
      finish()
    }
  }
  window.addEventListener('pointercancel', cancel, options)
  window.addEventListener('lostpointercapture', cancel, options)
  window.addEventListener(
    'blur',
    () => {
      finish()
      if (dot) {
        dot.style.opacity = '0'
      }
    },
    { signal: abort.signal }
  )
  window.addEventListener('scroll', measure, options)
  const resize = new ResizeObserver(measure)
  resize.observe(viewport)
  return {
    finish,
    dispose: () => {
      abort.abort()
      resize.disconnect()
      unsubscribeView()
      unsubscribeAnnotation()
      finish()
      painter.clear()
      svg.remove()
      laser.remove()
      delete viewport.dataset.presentationPointing
    }
  }
}
