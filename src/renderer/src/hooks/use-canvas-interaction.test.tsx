import { useRef } from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useDocumentStore } from '@/store/document-store'
import { useInteractionOverlayStore } from '@/store/interaction-overlay-store'
import { useToolStore } from '@/store/tool-store'
import { createElementForTool } from '@/lib/interaction/create-element-for-tool'
import { useCanvasInteraction } from './use-canvas-interaction'

const initialDocument = useDocumentStore.getState()
const initialTool = useToolStore.getState()
const initialOverlay = useInteractionOverlayStore.getState()

afterEach(() => {
  cleanup()
  useDocumentStore.setState(initialDocument, true)
  useToolStore.setState(initialTool, true)
  useInteractionOverlayStore.setState(initialOverlay, true)
})

function Canvas() {
  const ref = useRef<HTMLDivElement>(null)
  const handlers = useCanvasInteraction(ref)
  return (
    <div
      ref={ref}
      data-testid="canvas"
      onPointerDown={handlers.onPointerDown}
      onPointerMove={handlers.onPointerMove}
    />
  )
}

it('clears the idle connector hover preview when the window loses focus', () => {
  const { getByTestId } = render(<Canvas />)
  const store = useDocumentStore.getState()
  store.insertElement(
    createElementForTool(
      'rectangle',
      store.document,
      { x: 100, y: 100, width: 100, height: 100 },
      { x: 100, y: 100 }
    )
  )
  useToolStore.getState().setTool('connector')
  fireEvent.pointerMove(getByTestId('canvas'), {
    pointerId: 7,
    isPrimary: true,
    buttons: 0,
    clientX: 150,
    clientY: 150
  })
  expect(useInteractionOverlayStore.getState().anchorPreview).not.toBeNull()
  fireEvent.blur(window)
  expect(useInteractionOverlayStore.getState().anchorPreview).toBeNull()
})

it.each(['rectangle', 'connector'] as const)(
  'unmount cancels %s and detaches the active pointer listeners',
  (tool) => {
    const { getByTestId, unmount } = render(<Canvas />)
    const canvas = getByTestId('canvas')
    const release = vi.fn()
    Object.assign(canvas, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: release
    })
    useToolStore.getState().setTool(tool)
    const pointer = {
      pointerId: 7,
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: 100,
      clientY: 100
    }
    fireEvent.pointerDown(canvas, pointer)
    fireEvent.pointerMove(window, { ...pointer, button: -1, clientX: 250, clientY: 200 })
    expect(
      tool === 'connector'
        ? useDocumentStore.getState().document.order.length
        : useInteractionOverlayStore.getState().createPreview
    ).toBeTruthy()
    unmount()
    expect(release).toHaveBeenCalledWith(7)
    expect(useInteractionOverlayStore.getState().createPreview).toBeNull()
    expect(useDocumentStore.getState().document.order).toEqual([])
    fireEvent.pointerUp(window, { ...pointer, buttons: 0, clientX: 300, clientY: 250 })
    fireEvent.pointerMove(window, { ...pointer, button: -1, clientX: 400, clientY: 300 })
    expect(useDocumentStore.getState().document.order).toEqual([])
    expect(useDocumentStore.getState().past).toEqual([])
  }
)
