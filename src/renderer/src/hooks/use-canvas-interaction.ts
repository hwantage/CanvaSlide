import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject
} from 'react'
import { screenToWorld } from '@shared/canvas/camera-transform'
import type { HandlePosition } from '@shared/canvas/resize-handles'
import {
  createCanvasInteraction,
  type PointerInfo
} from '@/lib/interaction/canvas-interaction-session'
import { createCanvasPointerSession } from '@/lib/interaction/canvas-pointer-session'
import { importableFilesFrom, insertFile } from '@/lib/document/external-content'
import { hasPrimaryModifier, isEditableTarget } from '@/lib/platform-keys'
import { hasNativeTextMenu } from '@/lib/native-context-menu'
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
  onDoubleClick: (event: MouseEvent<HTMLElement>) => void
  onContextMenu: (event: MouseEvent<HTMLElement>) => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
  onResizeHandleDown: (handle: HandlePosition, event: PointerEvent<HTMLElement>) => void
  onRotateHandleDown: (event: PointerEvent<HTMLElement>) => void
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

  const pointers = useRef<ReturnType<typeof createCanvasPointerSession> | null>(null)
  useEffect(() => {
    const session = createCanvasPointerSession({
      move: (event) => interaction.pointerMove(toInfo(event)),
      finish: (event) => interaction.pointerUp(toInfo(event)),
      cancel: () => interaction.cancel()
    })
    pointers.current = session
    window.addEventListener('blur', session.cancel)
    return () => {
      window.removeEventListener('blur', session.cancel)
      session.dispose()
      pointers.current = null
    }
  }, [interaction, toInfo])

  return useMemo(
    () => ({
      onPointerDown: (event) => {
        // Why: capturing here would retarget the click away from overlay buttons inside the viewport.
        if (isEditableTarget(event.target) || isOverlayUiTarget(event.target)) {
          return
        }
        pointers.current?.start(event.nativeEvent, event.currentTarget, () => {
          interaction.pointerDown(toInfo(event))
          return interaction.isActive()
        })
      },
      onPointerMove: (event) => {
        if (!pointers.current?.isActive() && event.isPrimary && event.buttons === 0) {
          interaction.pointerMove(toInfo(event))
        }
      },
      onDoubleClick: (event) => interaction.doubleClick(toInfo(event)),
      onContextMenu: (event) => {
        if (hasNativeTextMenu(event.target)) {
          return
        }
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
        if (event.button !== 0 || !ref.current) {
          return
        }
        pointers.current?.start(event.nativeEvent, ref.current, () => {
          interaction.startResize(handle, toInfo(event))
          return interaction.isActive()
        })
      },
      onRotateHandleDown: (event) => {
        event.stopPropagation()
        if (event.button !== 0 || !ref.current) {
          return
        }
        pointers.current?.start(event.nativeEvent, ref.current, () => {
          interaction.startRotate(toInfo(event))
          return interaction.isActive()
        })
      },
      onConnectorEndDown: (id, which, event) => {
        event.stopPropagation()
        if (event.button !== 0 || !ref.current) {
          return
        }
        pointers.current?.start(event.nativeEvent, ref.current, () => {
          interaction.startConnectorEnd(id, which)
          return interaction.isActive()
        })
      }
    }),
    [interaction, pointers, toInfo, ref]
  )
}
