import { expect, test, type Page } from '@playwright/test'
import type { StoreApi } from 'zustand'

type ReflowWindow = {
  reflow: {
    camera: StoreApi<{ isAnimating: () => boolean }>
    presentation: StoreApi<{ start: (index: number) => void; goTo: (index: number) => void }>
  }
}

/** Screen-space line boxes of every text on screen, keyed by element id. */
type TextLines = Record<string, { x: number; width: number }[]>

function text(id: string, x: number, y: number, width: number, fontSize: number, body: string) {
  return {
    id,
    type: 'text',
    x,
    y,
    width,
    height: fontSize * 1.4,
    text: body,
    // No fontFamily: the system font is the one whose metrics used to change with the layout zoom.
    textStyle: { color: '#0f172a', fontSize, align: 'left', bold: false }
  }
}

/** Enough vectors to make the world composited, so its layout zoom follows the camera at rest. */
const DENSE_VECTOR_COUNT = 260

function filler(index: number) {
  return {
    id: `dot-${index}`,
    type: 'shape',
    shape: 'ellipse',
    x: 8000 + (index % 20) * 40,
    y: 8000 + Math.floor(index / 20) * 40,
    width: 20,
    height: 20,
    style: { fill: '#e2e8f0', stroke: '#cbd5e1', strokeWidth: 1, cornerRadius: 0 },
    text: '',
    textStyle: { color: '#0f172a', fontSize: 12, align: 'left', bold: false }
  }
}

async function openDeck(page: Page) {
  const elements = [
    { id: 'wide', type: 'frame', name: 'Wide', order: 0, x: 0, y: 0, width: 3200, height: 1800 },
    {
      id: 'close',
      type: 'frame',
      name: 'Close',
      order: 1,
      x: 3400,
      y: 600,
      width: 400,
      height: 225
    },
    text('latin', 3420, 620, 380, 11, 'Small system text with Latin letters and digits 0123456789'),
    text('korean', 3420, 650, 380, 12, '이동 중과 도착 후의 글자 간격이 같아야 한다'),
    text(
      'paragraph',
      3420,
      680,
      380,
      10,
      'A ten pixel paragraph wrapping across a few lines to see whether a line break flips between the two layouts of the same text.'
    ),
    // Why: only a composited (dense) world is re-laid out when a flight lands; a painted one
    // never is, so the deck has to be dense for the landing commit to exist at all.
    ...Array.from({ length: DENSE_VECTOR_COUNT }, (_, index) => filler(index))
  ]
  const document = {
    version: 2,
    name: 'Reflow',
    elements: Object.fromEntries(elements.map((e) => [e.id, e])),
    order: elements.map((e) => e.id),
    settings: { transitionMs: 300, background: 'plain', frameBorder: 'solid' },
    assets: {},
    camera: { x: 0, y: 0, zoom: 1 }
  }
  await page.goto('/')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Open/ }).click()
  await (
    await chooser
  ).setFiles({
    name: 'reflow.canvaslide',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(document))
  })
  await expect(page.getByTestId('frame-row')).toHaveCount(2)
}

async function bindStores(page: Page) {
  await page.evaluate(async () => {
    const url = (name: string) =>
      performance
        .getEntriesByType('resource')
        .map((r) => r.name)
        .filter((path) => path.includes(`/src/store/${name}.ts`))
        .at(-1)!
    const w = window as unknown as ReflowWindow
    w.reflow = {
      camera: (await import(url('camera-store'))).useCameraStore,
      presentation: (await import(url('presentation-store'))).usePresentationStore
    }
  })
}

const measureLines = (page: Page) =>
  page.evaluate((): TextLines => {
    const lines: TextLines = {}
    for (const box of document.querySelectorAll(
      '[data-testid="world-layer"] .whitespace-pre-wrap'
    )) {
      const id = box.closest<HTMLElement>('[data-element-id]')!.dataset.elementId!
      const range = document.createRange()
      range.selectNodeContents(box)
      lines[id] = [...range.getClientRects()].map((r) => ({ x: r.x, width: r.width }))
    }
    return lines
  })

const layoutZoom = (page: Page) =>
  page.getByTestId('world-layer').evaluate((el) => (el.firstElementChild as HTMLElement).style.zoom)

const waitForArrival = (page: Page) =>
  page.waitForFunction(
    () => !(window as unknown as ReflowWindow).reflow.camera.getState().isAnimating()
  )

// Why: only WebKit sizes the system font's tracking from the laid-out size; Chromium passes this
// regardless, so run it there too with CANVASLIDE_E2E_WEBKIT=1 --project=webkit. The deck is
// dense on purpose: a painted world is never re-laid out, a composited one commits the arrival
// zoom after landing and must not move a glyph doing so.
test('text keeps its line breaks and widths from the moment a flight lands until the layout settles @webkit', async ({
  page,
  browserName
}) => {
  await openDeck(page)
  await bindStores(page)

  await page.evaluate(() =>
    (window as unknown as ReflowWindow).reflow.presentation.getState().start(0)
  )
  await waitForArrival(page)
  await expect.poll(() => layoutZoom(page)).toBe('1')

  await page.evaluate(() =>
    (window as unknown as ReflowWindow).reflow.presentation.getState().goTo(1)
  )
  await waitForArrival(page)
  // The flight has landed but the settle timer has not committed the arrival zoom yet.
  expect(await layoutZoom(page)).toBe('1')
  const landed = await measureLines(page)
  expect(Object.keys(landed).sort()).toEqual(['korean', 'latin', 'paragraph'])
  expect(landed.paragraph!.length).toBeGreaterThan(1)

  await expect.poll(() => layoutZoom(page)).not.toBe('1')
  const settled = await measureLines(page)
  for (const [id, lines] of Object.entries(landed)) {
    expect(settled[id], id).toHaveLength(lines.length)
    lines.forEach((line, index) => {
      expect(settled[id]![index]!.x, `${id} line ${index} x`).toBeCloseTo(line.x, 0)
      expect(settled[id]![index]!.width, `${id} line ${index} width`).toBeCloseTo(line.width, 0)
    })
  }
  // Blink lays the system font out consistently on its own; only WebKit needs optical sizing off.
  await expect(page.locator('[data-element-id="latin"]')).toHaveCSS(
    'font-optical-sizing',
    browserName === 'webkit' ? 'none' : 'auto'
  )
})
