import { createFigSvgRenderer, figXml } from './fig-svg'
import { FIG_IDENTITY, figChildren } from './fig-scene'
import { emptyFigWarnings, type FigFile, type FigNode } from './fig-types'

test('escapes file text and font names rather than injecting markup', () => {
  expect(figXml('<script>"&')).toBe('&lt;script&gt;&quot;&amp;')
  const node: FigNode = {
    guid: { sessionID: 0, localID: 1 },
    type: 'TEXT',
    textData: { characters: '<script>alert(1)</script>' },
    fontName: { family: '" onload="x' },
    size: { x: 100, y: 20 },
    fillPaints: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }]
  }
  const file: FigFile = { name: '', nodes: [node], images: new Map(), blobs: [] }
  const svg = createFigSvgRenderer(file, figChildren(file), emptyFigWarnings())(
    node,
    FIG_IDENTITY,
    { x: 0, y: 0, width: 100, height: 20 }
  )
  expect(svg).not.toContain('<script>')
  expect(svg).toContain('font-family="&quot; onload=&quot;x"')
})

test('applies inverse image crop transforms and contains image references inside the SVG', () => {
  const node: FigNode = {
    guid: { sessionID: 0, localID: 1 },
    type: 'RECTANGLE',
    size: { x: 200, y: 100 },
    fillPaints: [
      {
        type: 'IMAGE',
        image: { hash: new Uint8Array(20) },
        imageScaleMode: 'STRETCH',
        transform: { ...FIG_IDENTITY, m11: 0.5 }
      }
    ]
  }
  const file: FigFile = {
    name: '',
    nodes: [node],
    images: new Map([['0'.repeat(40), new Uint8Array([137, 80, 78, 71])]]),
    blobs: []
  }
  const warnings = emptyFigWarnings()
  const svg = createFigSvgRenderer(file, figChildren(file), warnings)(node, FIG_IDENTITY, {
    x: 0,
    y: 0,
    width: 200,
    height: 100
  })
  expect(svg).toContain('matrix(200 0 0 200 0 0)')
  expect(svg).toContain('clip-path="url(#')
  expect(svg).toContain('href="data:image/png;base64,')
  expect(warnings.missingImage).toBe(0)
})

test('reports missing images instead of requesting external resources', () => {
  const node: FigNode = {
    guid: { sessionID: 0, localID: 1 },
    type: 'RECTANGLE',
    size: { x: 200, y: 100 },
    fillPaints: [{ type: 'IMAGE', image: { hash: new Uint8Array(20) } }]
  }
  const warnings = emptyFigWarnings()
  const svg = createFigSvgRenderer(
    { name: '', nodes: [node], blobs: [], images: new Map() },
    new Map(),
    warnings
  )(node, FIG_IDENTITY, { x: 0, y: 0, width: 200, height: 100 })
  expect(svg).not.toContain('<image')
  expect(warnings.missingImage).toBe(1)
})
