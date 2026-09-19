type PointerCallbacks = {
  move: (event: PointerEvent) => void
  finish: (event: PointerEvent) => void
  cancel: () => void
}

type ActivePointer = {
  id: number
  button: number
  buttons: number
  target: HTMLElement
  lastEvent: PointerEvent
}

function needsFinalMove(previous: PointerEvent, event: PointerEvent): boolean {
  return (
    previous.clientX !== event.clientX ||
    previous.clientY !== event.clientY ||
    (previous.type === 'pointermove' &&
      (previous.shiftKey !== event.shiftKey ||
        previous.altKey !== event.altKey ||
        previous.ctrlKey !== event.ctrlKey ||
        previous.metaKey !== event.metaKey))
  )
}

export function createCanvasPointerSession(callbacks: PointerCallbacks) {
  let active: ActivePointer | null = null

  const detach = () => {
    window.removeEventListener('pointermove', onMove, true)
    window.removeEventListener('pointerup', onUp, true)
    window.removeEventListener('pointercancel', onPointerCancel, true)
    window.removeEventListener('pointerdown', onFreshDown, true)
    window.removeEventListener('keydown', onKeyDown, true)
  }

  const release = (pointer: ActivePointer | null) => {
    if (pointer?.target.hasPointerCapture(pointer.id)) {
      pointer.target.releasePointerCapture(pointer.id)
    }
  }

  const cancel = () => {
    const pointer = active
    active = null
    detach()
    callbacks.cancel()
    release(pointer)
  }

  const finish = (event: PointerEvent) => {
    const pointer = active
    active = null
    detach()
    // Reapplying an unchanged position can create an undo entry for a handle click.
    if (pointer && needsFinalMove(pointer.lastEvent, event)) {
      callbacks.move(event)
    }
    callbacks.finish(event)
    release(pointer)
  }

  const onMove = (event: PointerEvent) => {
    if (!active || event.pointerId !== active.id) {
      return
    }
    if ((event.buttons & active.buttons) !== 0) {
      active.lastEvent = event
      callbacks.move(event)
    } else if (event.button === active.button) {
      // Releasing one of several held buttons produces pointermove instead of pointerup.
      finish(event)
    }
    // A zero-button hover can precede pointerup after capture loss; it cannot end the edit.
  }

  const onUp = (event: PointerEvent) => {
    if (active && event.pointerId === active.id && (event.buttons & active.buttons) === 0) {
      finish(event)
    }
  }

  const onPointerCancel = (event: PointerEvent) => {
    if (event.pointerId === active?.id) {
      cancel()
    }
  }

  const onFreshDown = (event: PointerEvent) => {
    // A new press of this pointer supersedes a release missed outside the window.
    if (event.pointerId === active?.id) {
      cancel()
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    // Cancel before the normal Escape shortcut clears selection.
    if (event.key === 'Escape') {
      cancel()
    }
  }

  return {
    isActive: () => active !== null,
    cancel,
    start: (event: PointerEvent, target: HTMLElement, begin: () => boolean) => {
      if (active || !event.isPrimary || (event.button !== 0 && event.button !== 1)) {
        return
      }
      if (!begin()) {
        return
      }
      // Middle-button pan must suppress native paste on Linux and autoscroll on Windows.
      if (event.button === 1) {
        event.preventDefault()
      }
      active = {
        id: event.pointerId,
        button: event.button,
        buttons: event.button === 1 ? 4 : 1,
        target,
        lastEvent: event
      }
      // Capture may end before release; window capture listeners also see releases over editors/UI.
      window.addEventListener('pointermove', onMove, true)
      window.addEventListener('pointerup', onUp, true)
      window.addEventListener('pointercancel', onPointerCancel, true)
      window.addEventListener('pointerdown', onFreshDown, true)
      window.addEventListener('keydown', onKeyDown, true)
      try {
        target.setPointerCapture(event.pointerId)
      } catch (error) {
        // The pointer may already have ended; the window listeners still receive its release.
        if (!(error instanceof DOMException && error.name === 'NotFoundError')) {
          cancel()
          throw error
        }
      }
    }
  }
}
