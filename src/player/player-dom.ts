import type { CanvasDocument, FrameElement } from '@shared/canvas/element-types'
import { overviewStackRanks, overviewZIndex } from '@shared/canvas/overview-stacking'
import { orderedFrames } from '@shared/canvas/presentation-sequence'
import { renderElement } from '@shared/render/element-dom'

/** The player's world: overview frame targets, then every element through the shared renderer. */

export type FrameNode = { frame: FrameElement; node: HTMLElement; index: number }

function frameNode(frame: FrameElement, index: number, zIndex: number): HTMLElement {
  const node = document.createElement('div')
  node.className = 'uc-frame'
  Object.assign(node.style, {
    left: `${frame.x}px`,
    top: `${frame.y}px`,
    width: `${frame.width}px`,
    height: `${frame.height}px`,
    zIndex: String(zIndex)
  })
  node.dataset.frameIndex = String(index)
  const label = document.createElement('div')
  label.className = 'uc-frame-label'
  const badge = document.createElement('b')
  badge.textContent = String(index + 1)
  const name = document.createElement('span')
  name.textContent = frame.name
  label.append(badge, name)
  node.append(label)
  return node
}

export function renderDocument(
  doc: CanvasDocument,
  zoomLayer: HTMLElement
): { frameNodes: FrameNode[] } {
  const frames = orderedFrames(doc)
  const ranks = overviewStackRanks(frames)
  const frameNodes = frames.map((frame, index) => {
    // Why: a frame that covers others would otherwise swallow their clicks in overview.
    const node = frameNode(frame, index, overviewZIndex(ranks[frame.id] ?? 0, frames.length))
    zoomLayer.append(node)
    return { frame, node, index }
  })
  for (const id of doc.order) {
    const element = doc.elements[id]
    if (!element || element.type === 'frame') {
      continue
    }
    const node = renderElement(element, doc)
    if (node) {
      zoomLayer.append(node)
    }
  }
  return { frameNodes }
}
