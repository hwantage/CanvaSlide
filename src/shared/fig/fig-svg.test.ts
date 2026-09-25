import { createFigSvgRenderer, figImageMime, figXml } from './fig-svg'
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
    images: new Map([['0'.repeat(40), new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])]]),
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

test('preserves glyph colors from both style tables with overrides taking precedence', () => {
  const red = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }]
  const blue = [{ type: 'SOLID', color: { r: 0, g: 0, b: 1 } }]
  const node: FigNode = {
    guid: { sessionID: 0, localID: 1 },
    type: 'TEXT',
    size: { x: 100, y: 20 },
    fillPaints: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
    textData: {
      characters: 'ABCD',
      characterStyleIDs: [1, 2, 3, 4],
      styleOverrideTable: [
        { styleID: 2, fillPaints: blue },
        { styleID: 3, fillPaints: blue }
      ]
    },
    textStyleTable: [
      { guid: { sessionID: 0, localID: 2 }, type: 'TEXT', styleID: 1, fillPaints: red },
      { guid: { sessionID: 0, localID: 3 }, type: 'TEXT', styleID: 2, fillPaints: red }
    ],
    derivedTextData: {
      glyphs: [0, 1, 2, 3].map((firstCharacter) => ({
        commandsBlob: 0,
        position: { x: firstCharacter * 20, y: 20 },
        fontSize: 20,
        firstCharacter
      }))
    }
  }
  const bytes = new Uint8Array(28)
  const view = new DataView(bytes.buffer)
  for (const [index, [command, x, y]] of [
    [1, 0, 0],
    [2, 1, 0],
    [2, 0, 1]
  ].entries()) {
    bytes[index * 9] = command!
    view.setFloat32(index * 9 + 1, x!, true)
    view.setFloat32(index * 9 + 5, y!, true)
  }
  const file: FigFile = { name: '', nodes: [node], images: new Map(), blobs: [{ bytes }] }
  const svg = createFigSvgRenderer(file, figChildren(file), emptyFigWarnings())(
    node,
    FIG_IDENTITY,
    { x: 0, y: 0, width: 100, height: 20 }
  )
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const colors = Array.from(document.querySelectorAll('use'), (glyph) =>
    glyph.closest('[fill]')?.getAttribute('fill')
  )
  expect(colors).toEqual(['rgba(255,0,0,1)', 'rgba(0,0,255,1)', 'rgba(0,0,255,1)', 'rgba(0,0,0,1)'])
})

test('detects Figma bitmaps from their full signatures and only in formats the importer embeds', () => {
  const bytes = (binary: string) => Uint8Array.from(binary, (char) => char.charCodeAt(0))
  expect(figImageMime(bytes('\x89PNG\r\n\x1a\n'))).toBe('image/png')
  expect(figImageMime(bytes('RIFF\x1a\0\0\0WEBPVP8L'))).toBe('image/webp')
  expect(figImageMime(bytes('\x89PNG'))).toBeNull()
  expect(figImageMime(bytes('GIF90a'))).toBeNull()
  expect(figImageMime(bytes('\0\0\0\0\0\0\0\0WEBP'))).toBeNull()
  expect(figImageMime(bytes('BM\x3a\0\0\0'))).toBeNull()
})
