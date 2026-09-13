import { hitTestTopmost, rectContainsPoint, selectionBounds } from '@shared/canvas/element-bounds'
import type { Point } from '@shared/canvas/element-types'
import { useCameraStore } from '@/store/camera-store'
import { useContextMenuStore } from '@/store/context-menu-store'
import { useDocumentStore } from '@/store/document-store'
import { useToolStore } from '@/store/tool-store'
import { frameHitChromeAt } from './frame-chrome'

/**
 * Right-click: the element under the cursor becomes the selection unless it is already part of
 * one (so a multi-selection survives); empty space outside the selection clears it.
 */
export function openContextMenu(screen: Point, world: Point): void {
  const doc = useDocumentStore.getState()
  const chrome = frameHitChromeAt(useCameraStore.getState().camera.zoom)
  const hit = hitTestTopmost(doc.document, world, chrome)
  if (hit && !doc.selectedIds.includes(hit.id)) {
    useToolStore.getState().setEditingTextId(null)
    doc.setSelection([hit.id])
  } else if (!hit) {
    const bounds = selectionBounds(doc.document, doc.selectedIds)
    if (!bounds || !rectContainsPoint(bounds, world)) {
      doc.clearSelection()
    }
  }
  useContextMenuStore.getState().show(screen, world)
}
