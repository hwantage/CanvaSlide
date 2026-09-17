import type { Camera } from '@shared/canvas/element-types'

/**
 * How long the reveal waits for the next image after one has its detail ready. Renders finish
 * one after another, so as long as they keep coming the wait continues; once nothing has come
 * for this long, whatever is ready is shown. Why not wait forever: a render can fail or crawl,
 * and a sharp picture late is better than a soft one for good.
 */
export const DETAIL_REVEAL_DEADLINE_MS = 600

type Batch = {
  camera: Camera
  expected: Set<string>
  painted: Set<string>
  revealed: boolean
  timer: ReturnType<typeof setTimeout> | null
}

const listeners = new Set<() => void>()
let batch: Batch | null = null

/**
 * Coordinates when images show the detail they rendered for a camera. Why: a frame is often a
 * stack of translucent photos, and each detail render finishes on its own — shown as they come,
 * the composite changes a dozen times in the second after landing, which reads as the picture
 * lurching. Every image rendering for the same camera waits until all of them have painted (or a
 * deadline has passed) and they are revealed in one frame.
 */
function batchFor(camera: Camera): Batch {
  if (!batch || batch.camera !== camera) {
    if (batch?.timer) {
      clearTimeout(batch.timer)
    }
    batch = { camera, expected: new Set(), painted: new Set(), revealed: false, timer: null }
  }
  return batch
}

function reveal(current: Batch): void {
  if (current.revealed) {
    return
  }
  current.revealed = true
  if (current.timer) {
    clearTimeout(current.timer)
    current.timer = null
  }
  for (const listener of listeners) {
    listener()
  }
}

function settle(current: Batch): void {
  if (!current.revealed && [...current.expected].every((id) => current.painted.has(id))) {
    reveal(current)
  }
}

/** An image has started rendering detail for `camera`; the reveal waits for it. */
export function expectDetail(camera: Camera, id: string): void {
  const current = batchFor(camera)
  if (!current.revealed) {
    current.expected.add(id)
  }
}

/** The render for `camera` was abandoned; the others need not wait for it. */
export function withdrawDetail(camera: Camera, id: string): void {
  if (batch?.camera === camera) {
    batch.expected.delete(id)
    settle(batch)
  }
}

/** The image's detail for `camera` is painted and could be shown. */
export function detailPainted(camera: Camera, id: string): void {
  const current = batchFor(camera)
  current.expected.add(id)
  current.painted.add(id)
  if (!current.revealed) {
    if (current.timer) {
      clearTimeout(current.timer)
    }
    current.timer = setTimeout(() => {
      current.timer = null
      reveal(current)
    }, DETAIL_REVEAL_DEADLINE_MS)
  }
  settle(current)
}

export function detailRevealed(camera: Camera): boolean {
  return batch?.camera === camera && batch.revealed
}

export function subscribeDetailReveal(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Test seam. */
export function resetDetailReveal(): void {
  if (batch?.timer) {
    clearTimeout(batch.timer)
  }
  batch = null
}
