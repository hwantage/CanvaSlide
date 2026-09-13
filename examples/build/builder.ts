import {
  canvasDocumentSchema,
  type AnchorSide,
  type CanvasDocument,
  type ConnectorRoute,
  type ShapeKind,
  type TextAlign
} from '../../src/shared/canvas/element-types.ts'

export type ShapeOptions = {
  fill?: string
  stroke?: string
  strokeWidth?: number
  radius?: number
  text?: string
  color?: string
  fontSize?: number
  bold?: boolean
  align?: TextAlign
}

export type TextOptions = {
  fontSize?: number
  color?: string
  bold?: boolean
  align?: TextAlign
  width?: number
}

export type ConnectOptions = {
  route?: ConnectorRoute
  label?: string
  dashed?: boolean
  stroke?: string
  width?: number
  startHead?: 'none' | 'arrow'
  endHead?: 'none' | 'arrow'
  fromSide?: AnchorSide
  toSide?: AnchorSide
  color?: string
  fontSize?: number
}

/** Latin glyphs are ~0.56 em wide; CJK glyphs are full-width, so count them as 1.8 units. */
function textUnits(line: string): number {
  let units = 0
  for (const char of line) {
    units += /[\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(char) ? 1.8 : 1
  }
  return units
}

export const ink = '#18181b'
export const muted = '#71717a'

/** Builds a valid `.canvas.json` document with readable ids; frames are kept below everything. */
export class DocBuilder {
  private readonly doc: CanvasDocument
  private counter = 0
  private frameCount = 0

  constructor(name: string, settings: Partial<CanvasDocument['settings']> = {}) {
    this.doc = {
      version: 2,
      name,
      elements: {},
      order: [],
      settings: { transitionMs: 900, background: 'dots', frameBorder: 'solid', ...settings },
      assets: {}
    }
  }

  private nextId(prefix: string): string {
    this.counter += 1
    return `${prefix}-${this.counter}`
  }

  shape(
    kind: ShapeKind,
    x: number,
    y: number,
    width: number,
    height: number,
    options: ShapeOptions = {}
  ): string {
    const id = this.nextId(kind)
    this.doc.elements[id] = {
      id,
      type: 'shape',
      shape: kind,
      x,
      y,
      width,
      height,
      style: {
        fill: options.fill ?? '#ffffff',
        stroke: options.stroke ?? '#d4d4d8',
        strokeWidth: options.strokeWidth ?? 1.5,
        cornerRadius: Math.min(512, options.radius ?? 10)
      },
      text: options.text ?? '',
      textStyle: {
        color: options.color ?? ink,
        fontSize: options.fontSize ?? 16,
        align: options.align ?? 'center',
        bold: options.bold ?? false
      }
    }
    this.doc.order.push(id)
    return id
  }

  rect(x: number, y: number, w: number, h: number, options?: ShapeOptions): string {
    return this.shape('rectangle', x, y, w, h, options)
  }

  ellipse(x: number, y: number, w: number, h: number, options?: ShapeOptions): string {
    return this.shape('ellipse', x, y, w, h, options)
  }

  diamond(x: number, y: number, w: number, h: number, options?: ShapeOptions): string {
    return this.shape('diamond', x, y, w, h, options)
  }

  /** Height follows the line count; width defaults to the widest line so nothing wraps. */
  text(x: number, y: number, content: string, options: TextOptions = {}): string {
    const id = this.nextId('text')
    const fontSize = options.fontSize ?? 16
    const lines = content.split('\n')
    const widest = Math.max(...lines.map((line) => textUnits(line)))
    const charWidth = fontSize * (options.bold ? 0.62 : 0.56)
    const width = options.width ?? Math.ceil(widest * charWidth + 16)
    // Why: matches the renderer's 1.4 line-height so opening a sample does not mark it dirty.
    const height = Math.ceil(lines.length * fontSize * 1.4)
    this.doc.elements[id] = {
      id,
      type: 'text',
      x,
      y,
      width,
      height,
      text: content,
      textStyle: {
        color: options.color ?? ink,
        fontSize,
        align: options.align ?? 'left',
        bold: options.bold ?? false
      }
    }
    this.doc.order.push(id)
    return id
  }

  connect(from: string, to: string, options: ConnectOptions = {}): string {
    const id = this.nextId('connector')
    const a = this.doc.elements[from]
    const b = this.doc.elements[to]
    if (!a || !b) {
      throw new Error(`connect: unknown element ${from} or ${to}`)
    }
    // Why: end points and the bounding box are recomputed by syncConnectorGeometry on load.
    const start = { x: a.x + a.width / 2, y: a.y + a.height / 2 }
    const end = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    this.doc.elements[id] = {
      id,
      type: 'connector',
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.max(1, Math.abs(end.x - start.x)),
      height: Math.max(1, Math.abs(end.y - start.y)),
      start: {
        ...start,
        elementId: from,
        ...(options.fromSide ? { side: options.fromSide, pinned: true } : {})
      },
      end: {
        ...end,
        elementId: to,
        ...(options.toSide ? { side: options.toSide, pinned: true } : {})
      },
      route: options.route ?? 'orthogonal',
      startHead: options.startHead ?? 'none',
      endHead: options.endHead ?? 'arrow',
      style: {
        stroke: options.stroke ?? '#71717a',
        strokeWidth: options.width ?? 1.5,
        dashed: options.dashed ?? false
      },
      label: options.label ?? '',
      textStyle: {
        color: options.color ?? muted,
        fontSize: options.fontSize ?? 12,
        align: 'center',
        bold: false
      }
    }
    this.doc.order.push(id)
    return id
  }

  frame(x: number, y: number, width: number, height: number, name: string): string {
    const id = this.nextId('frame')
    this.doc.elements[id] = { id, type: 'frame', name, order: this.frameCount, x, y, width, height }
    this.frameCount += 1
    this.doc.order.unshift(id)
    return id
  }

  /** Inline SVG as an image asset; keeps the sample self-contained with no binary files. */
  image(x: number, y: number, width: number, height: number, svg: string): string {
    return this.imageBytes(x, y, width, height, 'image/svg+xml', Buffer.from(svg.trim()))
  }

  /** Raster bytes (small logos only: the data URL is inlined into the document). */
  imageBytes(
    x: number,
    y: number,
    width: number,
    height: number,
    mime: string,
    bytes: Buffer
  ): string {
    const data = `data:${mime};base64,${bytes.toString('base64')}`
    const assetId = `asset-${Object.keys(this.doc.assets).length + 1}`
    this.doc.assets[assetId] = { id: assetId, mime, data, width, height }
    const id = this.nextId('image')
    this.doc.elements[id] = {
      id,
      type: 'image',
      assetId,
      naturalWidth: width,
      naturalHeight: height,
      x,
      y,
      width,
      height
    }
    this.doc.order.push(id)
    return id
  }

  /** Opens on the whole content at a comfortable zoom instead of the origin at 100%. */
  build(viewport = { width: 1150, height: 820 }): CanvasDocument {
    const rects = Object.values(this.doc.elements)
    const minX = Math.min(...rects.map((r) => r.x))
    const minY = Math.min(...rects.map((r) => r.y))
    const maxX = Math.max(...rects.map((r) => r.x + r.width))
    const maxY = Math.max(...rects.map((r) => r.y + r.height))
    const zoom = Math.min(
      1,
      (viewport.width / (maxX - minX)) * 0.92,
      (viewport.height / (maxY - minY)) * 0.92
    )
    const camera = {
      x: (viewport.width - (maxX - minX) * zoom) / 2 - minX * zoom,
      y: (viewport.height - (maxY - minY) * zoom) / 2 - minY * zoom,
      zoom: Number(zoom.toFixed(4))
    }
    return canvasDocumentSchema.parse({ ...this.doc, camera })
  }
}
