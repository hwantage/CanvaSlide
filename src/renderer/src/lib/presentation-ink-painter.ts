import type { Point } from '@shared/canvas/element-types'
import { inkPathData, shouldAppendInkPoint } from '@shared/canvas/presentation-ink'

const SVG_NS = 'http://www.w3.org/2000/svg'
/** Screen px: `non-scaling-stroke` keeps the nib that width however far the camera flies. */
const INK_WIDTH_PX = 4

export type InkPainter = {
  begin: (point: Point) => void
  extend: (point: Point, spacing: number) => void
  end: () => void
  clear: () => void
}

/**
 * Owns the ink strokes as SVG nodes under `group`, which the caller keeps on the camera. A stroke
 * stays until the layer is wiped — the show leaving the slide, the eraser, or the end of the show.
 * Nothing here is timed, and nothing reaches the document.
 */
export function createInkPainter(group: SVGGElement): InkPainter {
  let nodes: SVGPathElement[] = []
  /** `node` stays null until a second point makes this a line; a bare click leaves no mark at all. */
  let drawing: { points: Point[]; node: SVGPathElement | null } | null = null

  const createNode = () => {
    const node = document.createElementNS(SVG_NS, 'path')
    node.setAttribute('fill', 'none')
    node.setAttribute('stroke', 'var(--ink)')
    node.setAttribute('stroke-width', String(INK_WIDTH_PX))
    node.setAttribute('stroke-linecap', 'round')
    node.setAttribute('stroke-linejoin', 'round')
    node.setAttribute('vector-effect', 'non-scaling-stroke')
    group.append(node)
    nodes.push(node)
    return node
  }

  return {
    begin: (point) => {
      drawing = { points: [point], node: null }
    },
    extend: (point, spacing) => {
      if (!drawing || !shouldAppendInkPoint(drawing.points, point, spacing)) {
        return
      }
      drawing.points.push(point)
      drawing.node ??= createNode()
      drawing.node.setAttribute('d', inkPathData(drawing.points))
    },
    end: () => {
      drawing = null
    },
    clear: () => {
      for (const node of nodes) {
        node.remove()
      }
      nodes = []
      drawing = null
    }
  }
}
