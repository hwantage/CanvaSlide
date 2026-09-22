import { createChromeAutoHide } from '../canvas/presentation-chrome-auto-hide'
import {
  presentationAvailability,
  type PresentationCommand,
  type PresentationState
} from '../canvas/presentation-controls'
import {
  controlIcon,
  PRESENTATION_CONTROLS,
  type ControlId,
  type PresentationLabels
} from './presentation-control-definitions'

export function mountPresentationChrome(
  viewport: HTMLElement,
  labels: PresentationLabels,
  canExit: boolean,
  execute: (action: PresentationCommand) => void
) {
  const bar = document.createElement('div')
  bar.className = 'presentation-chrome'
  bar.dataset.testid = 'presentation-controls'
  bar.dataset.presentationUi = ''
  bar.dataset.hidden = 'false'
  bar.setAttribute('role', 'group')
  const tools = document.createElement('div')
  tools.className = 'presentation-tool-group'
  tools.id = `presentation-tools-${++nextToolsId}`
  tools.setAttribute('role', 'group')
  const counter = document.createElement('span')
  counter.className = 'presentation-counter'
  counter.dataset.testid = 'presentation-counter'
  const count = document.createElement('span')
  const name = document.createElement('span')
  name.className = 'presentation-frame-name'
  counter.append(count, name)
  const buttons = new Map<ControlId, HTMLButtonElement>()
  let menuOpen = false
  const chrome = createChromeAutoHide((visible) => {
    bar.dataset.hidden = String(!visible)
    bar.inert = !visible
    bar.setAttribute('aria-hidden', String(!visible))
  })
  const setMenu = (open: boolean, focus = false) => {
    menuOpen = open
    bar.dataset.toolsOpen = String(open)
    buttons.get('tools')?.setAttribute('aria-expanded', String(open))
    chrome.hold('menu', open)
    if (focus) {
      buttons.get(open ? 'togglePointer' : 'tools')?.focus()
    }
  }
  for (const definition of PRESENTATION_CONTROLS) {
    const { id } = definition
    if (id === 'exit' && !canExit) {
      continue
    }
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.action = id
    if (definition.testId) {
      button.dataset.testid = definition.testId
    }
    button.innerHTML = controlIcon(definition.icon)
    buttons.set(id, button)
    button.addEventListener('click', () => {
      if (id === 'tools') {
        setMenu(!menuOpen, true)
      } else {
        execute(id)
      }
    })
    if (id === 'togglePointer' || id === 'clearInk') {
      tools.append(button)
    } else {
      bar.append(button)
    }
    if (id === 'next') {
      bar.append(counter, tools)
    }
    if (id === 'tools') {
      button.className = 'presentation-tools-toggle'
      button.setAttribute('aria-controls', tools.id)
      button.setAttribute('aria-expanded', 'false')
    }
  }
  const updateLabels = (next: PresentationLabels) => {
    bar.setAttribute('aria-label', next.controls)
    tools.setAttribute('aria-label', next.tools)
    for (const [id, button] of buttons) {
      button.title = next[id]
      button.setAttribute('aria-label', next[id])
    }
  }
  updateLabels(labels)
  viewport.append(bar)
  const abort = new AbortController()
  const options = { signal: abort.signal }
  bar.addEventListener(
    'pointerenter',
    (e) => {
      if (e.pointerType === 'mouse') {
        chrome.hold('pointer', true)
      }
    },
    options
  )
  bar.addEventListener('pointerleave', () => chrome.hold('pointer', false), options)
  bar.addEventListener('focusin', () => chrome.hold('focus', true), options)
  bar.addEventListener(
    'focusout',
    (event) => {
      if (!bar.contains(event.relatedTarget as Node | null)) {
        chrome.hold('focus', false)
      }
    },
    options
  )
  const measure = () => viewport.getBoundingClientRect()
  let box = measure()
  const resize = new ResizeObserver(() => {
    box = measure()
    if (menuOpen && getComputedStyle(buttons.get('tools')!).display === 'none') {
      setMenu(false)
    }
  })
  resize.observe(viewport)
  window.addEventListener(
    'pointermove',
    (event) => chrome.pointerMovedTo(event.clientY - box.top, box.height),
    options
  )
  window.addEventListener(
    'pointerdown',
    (event) => {
      chrome.pointerMovedTo(event.clientY - box.top, box.height)
      if (menuOpen && event.target instanceof Node && !bar.contains(event.target)) {
        setMenu(false)
      }
      // Drawing prevents the browser's default focus transfer, so explicitly release chrome focus.
      if (
        event.target instanceof Node &&
        viewport.contains(event.target) &&
        !bar.contains(event.target) &&
        document.activeElement instanceof HTMLElement &&
        bar.contains(document.activeElement)
      ) {
        document.activeElement.blur()
      }
    },
    options
  )
  return {
    updateLabels,
    handleKey: (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const hidden = bar.dataset.hidden === 'true'
        chrome.reveal()
        if (hidden) {
          const reachable = [...bar.querySelectorAll('button')].filter(
            (button) => !button.disabled && button.getClientRects().length > 0
          )
          const target = event.shiftKey ? reachable.at(-1) : reachable[0]
          target?.focus()
          return true
        }
      }
      if (!menuOpen) {
        return false
      }
      if (event.key === 'Escape') {
        setMenu(false, true)
        return true
      }
      if (
        !(event.target instanceof Node) ||
        !tools.contains(event.target) ||
        !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
      ) {
        return false
      }
      const first = buttons.get('togglePointer')!
      const last = buttons.get('clearInk')!
      const target =
        event.key === 'Home'
          ? first
          : event.key === 'End'
            ? last
            : document.activeElement === first
              ? last
              : first
      target.focus()
      return true
    },
    sync: (state: PresentationState, pointing: boolean) => {
      const available = presentationAvailability(state)
      for (const id of ['next', 'previous', 'toggleOverview'] as const) {
        buttons.get(id)!.disabled = !available[id]
      }
      buttons.get('toggleOverview')!.setAttribute('aria-pressed', String(state.overview))
      buttons.get('togglePointer')!.setAttribute('aria-pressed', String(pointing))
      count.textContent = `${state.count ? state.index + 1 : 0} / ${state.count}`
      name.textContent = state.name
      name.title = state.name
    },
    dispose: () => {
      abort.abort()
      resize.disconnect()
      chrome.dispose()
      bar.remove()
    }
  }
}

let nextToolsId = 0
