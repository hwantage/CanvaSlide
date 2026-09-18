import {
  useCallback,
  useEffect,
  useMemo,
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject
} from 'react'
import { screenToWorld } from '@shared/canvas/camera-transform'
import type { HandlePosition } from '@shared/canvas/resize-handles'
import { createCanvasInteraction, type PointerInfo } from '@/lib/canvas-interaction-session'
import { importableFilesFrom, insertFile } from '@/lib/external-content'
import { hasPrimaryModifier, isEditableTarget } from '@/lib/platform-keys'
import { reportError } from '@/platform/document-file-access'
import { useCameraStore } from '@/store/camera-store'

/** Mouse/drag events share the fields `toInfo` needs; only pointer events carry `button`. */
function eventCoords(event: MouseEvent<HTMLElement> | DragEvent<HTMLElement>) {
  const { clientX, clientY, shiftKey, altKey, metaKey, ctrlKey } = event
  return { clientX, clientY, shiftKey, altKey, metaKey, ctrlKey }
}

function isOverlayUiTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-canvas-ui]') !== null
}

export type CanvasPointerHandlers = {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void
  onPointerMove: (event: PointerEvent<HTMLElement>) => void
  onPointerUp: (event: PointerEvent<HTMLElement>) => void
  onPointerCancel: () => void
  onDoubleClick: (event: MouseEvent<HTMLElement>) => void
  onContextMenu: (event: MouseEvent<HTMLElement>) => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
  onResizeHandleDown: (handle: HandlePosition, event: PointerEvent<HTMLElement>) => void
  onConnectorEndDown: (id: string, which: 'start' | 'end', event: PointerEvent<HTMLElement>) => void
}

export function useCanvasInteraction(ref: RefObject<HTMLElement | null>): CanvasPointerHandlers {
  const interaction = useMemo(() => createCanvasInteraction(), [])

  const toInfo = useCallback(
    (event: {
      clientX: number
      clientY: number
      shiftKey: boolean
      altKey: boolean
      metaKey: boolean
      ctrlKey: boolean
      button: number
    }): PointerInfo => {
      const bounds = ref.current?.getBoundingClientRect()
      const screen = {
        x: event.clientX - (bounds?.left ?? 0),
        y: event.clientY - (bounds?.top ?? 0)
      }
      return {
        screen,
        world: screenToWorld(useCameraStore.getState().camera, screen),
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        primaryKey: hasPrimaryModifier(event),
        button: event.button
      }
    },
    [ref]
  )

  useEffect(() => {
    const onCancel = () => interaction.cancel()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && interaction.isActive()) {
        interaction.cancel()
      }
    }
    window.addEventListener('blur', onCancel)
    // Cancel before the normal Escape shortcut clears selection, so a held pointer cannot select again.
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('blur', onCancel)
      window.removeEventListener('keydown', onKeyDown, true)
      interaction.cancel()
    }
  }, [interaction])

  return useMemo(
    () => ({
      onPointerDown: (event) => {
        // Why: capturing here would retarget the click away from overlay buttons inside the viewport.
        if (isEditableTarget(event.target) || isOverlayUiTarget(event.target)) {
          return
        }
        // Why: keep receiving moves after the pointer leaves the canvas mid-drag.
        event.currentTarget.setPointerCapture(event.pointerId)
        interaction.pointerDown(toInfo(event))
      },
      onPointerMove: (event) => interaction.pointerMove(toInfo(event)),
      onPointerUp: (event) => {
        interaction.pointerUp(toInfo(event))
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      },
      onPointerCancel: () => interaction.cancel(),
      onDoubleClick: (event) => interaction.doubleClick(toInfo(event)),
      onContextMenu: (event) => {
        event.preventDefault()
        if (isEditableTarget(event.target) || isOverlayUiTarget(event.target)) {
          return
        }
        interaction.contextMenu(toInfo({ ...eventCoords(event), button: 2 }))
      },
      onDragOver: (event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        }
      },
      onDrop: (event) => {
        const files = importableFilesFrom(event.dataTransfer)
        if (files.length === 0) {
          return
        }
        event.preventDefault()
        const { world } = toInfo({ ...eventCoords(event), button: 0 })
        void (async () => {
          for (const file of files) {
            try {
              await insertFile(file, world)
            } catch (error) {
              await reportError(error)
            }
          }
        })()
      },
      onResizeHandleDown: (handle, event) => {
        event.stopPropagation()
        ref.current?.setPointerCapture(event.pointerId)
        interaction.startResize(handle, toInfo(event))
      },
      onConnectorEndDown: (id, which, event) => {
        event.stopPropagation()
        ref.current?.setPointerCapture(event.pointerId)
        interaction.startConnectorEnd(id, which)
      }
    }),
    [interaction, toInfo, ref]
  )
}
