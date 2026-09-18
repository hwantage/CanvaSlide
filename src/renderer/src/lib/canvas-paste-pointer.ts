import { screenToWorld } from '@shared/canvas/camera-transform'
import type { Point } from '@shared/canvas/element-types'
import { useCameraStore } from '@/store/camera-store'
import { isEditableTarget } from './platform-keys'

let revision = 0
let readPointer: () => Point | null = () => null

export function canvasPastePointer(): { revision: number; world: Point | null } {
  return { revision, world: readPointer() }
}

/** Keep client coordinates so a later pan, zoom or viewport resize uses the current transform. */
export function trackCanvasPastePointer(viewport: HTMLElement): () => void {
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
      revision += 1
    }
  }
  readPointer = () => {
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
  return () => {
    document.removeEventListener('pointermove', update, true)
    document.removeEventListener('pointerdown', update, true)
    document.removeEventListener('pointerout', leaveWindow, true)
    window.removeEventListener('blur', clear)
    readPointer = () => null
  }
}
