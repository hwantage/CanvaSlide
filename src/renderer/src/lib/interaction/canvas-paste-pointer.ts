import { screenToWorld } from '@shared/canvas/camera-transform'
import type { Point } from '@shared/canvas/element-types'
import { useCameraStore } from '@/store/camera-store'
import { isEditableTarget } from '@/lib/platform-keys'

/** `revision` counts pointer moves over the canvas; `world` is where a paste would land now. */
export type PastePointer = { revision: number; world: Point | null }

export type CanvasPastePointer = {
  read: () => PastePointer
  /** Follows the pointer over `viewport` until the returned cleanup runs. */
  track: (viewport: HTMLElement) => () => void
}

export function createCanvasPastePointer(): CanvasPastePointer {
  let revision = 0
  let readWorld: () => Point | null = () => null
  return {
    read: () => ({ revision, world: readWorld() }),
    track: (viewport) => {
      const tracking = trackViewport(viewport, () => {
        revision += 1
      })
      readWorld = tracking.read
      return () => {
        tracking.dispose()
        // Why: a viewport tracked later owns the reader now; its cleanup clears it.
        if (readWorld === tracking.read) {
          readWorld = () => null
        }
      }
    }
  }
}

/** Keep client coordinates so a later pan, zoom or viewport resize uses the current transform. */
function trackViewport(
  viewport: HTMLElement,
  onMove: () => void
): { read: () => Point | null; dispose: () => void } {
  let client: Point | null = null
  const clear = () => {
    client = null
  }
  const update = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
      clear()
      return
    }
    const next = { x: event.clientX, y: event.clientY }
    const moved = !client || client.x !== next.x || client.y !== next.y
    client = next
    const target = event.target
    if (
      moved &&
      target instanceof Element &&
      viewport.contains(target) &&
      !target.closest('[data-canvas-ui]') &&
      !isEditableTarget(target)
    ) {
      onMove()
    }
  }
  const read = () => {
    if (!client) {
      return null
    }
    const bounds = viewport.getBoundingClientRect()
    if (
      client.x < bounds.left ||
      client.x >= bounds.right ||
      client.y < bounds.top ||
      client.y >= bounds.bottom
    ) {
      return null
    }
    const target = document.elementFromPoint(client.x, client.y)
    if (
      !target ||
      !viewport.contains(target) ||
      target.closest('[data-canvas-ui]') ||
      isEditableTarget(target)
    ) {
      return null
    }
    return screenToWorld(useCameraStore.getState().camera, {
      x: client.x - bounds.left,
      y: client.y - bounds.top
    })
  }
  const leaveWindow = (event: PointerEvent) => {
    if (!event.relatedTarget) {
      clear()
    }
  }
  document.addEventListener('pointermove', update, true)
  document.addEventListener('pointerdown', update, true)
  document.addEventListener('pointerout', leaveWindow, true)
  window.addEventListener('blur', clear)
  const dispose = () => {
    document.removeEventListener('pointermove', update, true)
    document.removeEventListener('pointerdown', update, true)
    document.removeEventListener('pointerout', leaveWindow, true)
    window.removeEventListener('blur', clear)
  }
  return { read, dispose }
}
