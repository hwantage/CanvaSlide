import { createAnnotationSession, type AnnotationSession } from './presentation-annotation-state'
import { resolvePresentationCommand, type PresentationCommand } from './presentation-controls'
import { presentationKeyAction } from './presentation-keys'
import { mountPresentationAnnotations } from './presentation-annotations'
import { mountPresentationChrome } from './presentation-chrome'
import type { PresentationLabels } from './presentation-control-definitions'
import type { PresentationHost } from './presentation-host'
import { ownsPresentationKey, PRESENTATION_UI } from './presentation-input'
import { bindSwipeNavigation } from './swipe-navigation'

/** One session owns controls, input, annotations and teardown in every presentation host. */
export function mountPresentationExperience(
  viewport: HTMLElement,
  host: PresentationHost,
  labels: PresentationLabels,
  session: AnnotationSession = createAnnotationSession()
) {
  session.reset()
  session.setFrame(host.getState().frameId)
  const annotations = mountPresentationAnnotations(viewport, host, session)
  const execute = (action: PresentationCommand) => {
    const command = resolvePresentationCommand(action, host.getState(), Boolean(host.exit))
    if (!command) {
      return false
    }
    switch (command) {
      case 'togglePointer':
        session.togglePointer()
        break
      case 'clearInk':
        session.clearInk()
        break
      case 'exit':
        host.exit?.()
        break
      case 'next':
      case 'previous':
      case 'toggleOverview':
        annotations.finish()
        host[command]()
        break
    }
    return true
  }
  const chrome = mountPresentationChrome(viewport, labels, Boolean(host.exit), execute)
  let overview = host.getState().overview
  const sync = () => {
    const state = host.getState()
    session.setFrame(state.frameId)
    if (overview !== state.overview) {
      annotations.finish()
    }
    overview = state.overview
    chrome.sync(state, session.getState().pointing)
  }
  const unsubscribeState = host.subscribeState(sync)
  const unsubscribeAnnotation = session.subscribe(() =>
    chrome.sync(host.getState(), session.getState().pointing)
  )
  sync()
  const unbindSwipe = bindSwipeNavigation(viewport, {
    isNavigable: () =>
      !host.getState().overview && !session.getState().pointing && !host.isInputBlocked?.(),
    next: () => execute('next'),
    previous: () => execute('previous'),
    chromeSelector: PRESENTATION_UI
  })
  const onKeyDown = (event: KeyboardEvent) => {
    if (host.isInputBlocked?.() || ownsPresentationKey(event)) {
      return
    }
    const composing = event.isComposing || event.keyCode === 229
    if (!composing && chrome.handleKey(event)) {
      event.preventDefault()
      return
    }
    const action = presentationKeyAction(event.key, { code: event.code, composing })
    if (action && execute(action)) {
      event.preventDefault()
    }
  }
  window.addEventListener('keydown', onKeyDown)
  return {
    updateLabels: chrome.updateLabels,
    dispose: () => {
      window.removeEventListener('keydown', onKeyDown)
      unbindSwipe()
      unsubscribeState()
      unsubscribeAnnotation()
      chrome.dispose()
      annotations.dispose()
      session.reset()
    }
  }
}
