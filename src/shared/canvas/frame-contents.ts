import { isFrameElement } from './element-runtime'
import { rectContainsRect, visibleBounds } from './element-bounds'
import type { CanvasDocument, CanvasElement, ElementId, FrameElement } from './element-types'

function contains(frame: FrameElement, element: CanvasElement): boolean {
  return rectContainsRect(frame, visibleBounds(element))
}

/** Spatial containment still applies; copy membership only resolves competing frames. */
export function withFrameContents(
  document: CanvasDocument,
  ids: readonly ElementId[]
): ElementId[] {
  const result = new Set(ids)
  const frames = document.order.flatMap((id) => {
    const element = document.elements[id]
    return element?.type === 'frame' ? [element] : []
  })
  const selectedFrames = frames.filter((frame) => result.has(frame.id))
  if (selectedFrames.length === 0) {
    return [...result]
  }
  for (const id of document.order) {
    const element = document.elements[id]
    if (!element || element.type === 'frame' || result.has(id)) {
      continue
    }
    const containers = selectedFrames.filter((frame) => contains(frame, element))
    if (containers.length === 0) {
      continue
    }
    // Leaving or deleting the matching frame restores ordinary spatial membership.
    if (
      containers.some((frame) => frame.frameContentKey === element.frameContentKey) ||
      !frames.some(
        (frame) => frame.frameContentKey === element.frameContentKey && contains(frame, element)
      )
    ) {
      result.add(id)
    }
  }
  return [...result]
}

/** Fresh keys keep repeated pastes separate without changing any source element. */
export function remapFrameContents(
  sources: readonly CanvasElement[],
  idMap: ReadonlyMap<ElementId, ElementId>
): CanvasElement[] {
  const frames = sources.filter(isFrameElement)
  const keys = new Map<string | undefined, string>()
  for (const frame of frames) {
    if (!keys.has(frame.frameContentKey)) {
      keys.set(frame.frameContentKey, idMap.get(frame.id)!)
    }
  }
  return sources.map((element) => {
    const containers =
      element.type === 'frame' ? [element] : frames.filter((frame) => contains(frame, element))
    const owner =
      containers.find((frame) => frame.frameContentKey === element.frameContentKey) ?? containers[0]
    const { frameContentKey: _oldKey, ...rest } = element
    return owner ? { ...rest, frameContentKey: keys.get(owner.frameContentKey)! } : rest
  })
}
