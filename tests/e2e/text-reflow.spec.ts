import { appModuleUrl } from './app-module'
import { encodeDocumentFixture } from './saved-document'
import { expect, test, type Page } from '@playwright/test'
import type { StoreApi } from 'zustand'

type ReflowWindow = {
  reflow: {
    camera: StoreApi<{ isAnimating: () => boolean }>
    presentation: StoreApi<{ start: (index: number) => void; goTo: (index: number) => void }>
  }
}

/** Screen-space line boxes of every text on screen, keyed by element id. */
type TextLines = Record<string, { x: number; y: number; width: number }[]>

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

/** Dense slideshows restore native layout resolution even without a world compositing hint. */
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

async function openDeck(page: Page, dense: boolean) {
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
    // Dense worlds commit a layout zoom after landing; light worlds keep their original layout.
    ...Array.from({ length: dense ? DENSE_VECTOR_COUNT : 0 }, (_, index) => filler(index))
  ]
  const document = {
    version: 1,
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
    buffer: encodeDocumentFixture(document)
  })
  await expect(page.getByTestId('frame-row')).toHaveCount(2)
}

async function bindStores(page: Page) {
  await page.evaluate(
    async ({ cameraUrl, presentationUrl }) => {
      const w = window as unknown as ReflowWindow
      w.reflow = {
        camera: (await import(cameraUrl)).useCameraStore,
        presentation: (await import(presentationUrl)).usePresentationStore
      }
    },
    {
      cameraUrl: appModuleUrl('store/camera-store.ts'),
      presentationUrl: appModuleUrl('store/presentation-store.ts')
    }
  )
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
      lines[id] = []
      for (const r of range.getClientRects()) {
        const previous = lines[id].at(-1)
        // Blink can return a separate trailing-space fragment on the same line.
        if (previous?.y === r.y) {
          previous.width = Math.max(previous.width, r.right - previous.x)
        } else {
          lines[id].push({ x: r.x, y: r.y, width: r.width })
        }
      }
    }
    return lines
  })

const layoutZoom = (page: Page) =>
  page.getByTestId('world-layer').evaluate((el) => (el.firstElementChild as HTMLElement).style.zoom)

const waitForArrival = (page: Page) =>
  page.waitForFunction(
    () => !(window as unknown as ReflowWindow).reflow.camera.getState().isAnimating()
  )

for (const dense of [false, true]) {
  test(`text keeps its layout after landing in a ${dense ? 'dense' : 'light'} world @webkit`, async ({
    page,
    browserName
  }) => {
    await openDeck(page, dense)
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
    expect(await layoutZoom(page)).toBe('1')
    const landed = await measureLines(page)
    expect(Object.keys(landed).sort()).toEqual(['korean', 'latin', 'paragraph'])
    expect(landed.paragraph!.length).toBeGreaterThan(1)

    if (dense) {
      await expect.poll(() => layoutZoom(page)).not.toBe('1')
    } else {
      await page.waitForTimeout(300)
      expect(await layoutZoom(page)).toBe('1')
    }
    const settled = await measureLines(page)
    const zoom = Number(await layoutZoom(page))
    for (const [id, lines] of Object.entries(landed)) {
      expect(settled[id], id).toHaveLength(lines.length)
      lines.forEach((line, index) => {
        for (const axis of ['x', 'y', 'width'] as const) {
          // Blink quantizes glyph advances and font ascent when dense worlds change CSS zoom.
          const tolerance =
            dense && browserName === 'chromium'
              ? axis === 'width'
                ? Math.max(0.1, line.width * 0.005)
                : axis === 'y'
                  ? zoom + 1
                  : 0.1
              : 0.1
          expect(
            Math.abs(settled[id]![index]![axis] - line[axis]),
            `${id} line ${index} ${axis}`
          ).toBeLessThan(tolerance)
        }
      })
    }
    await expect(page.locator('[data-element-id="latin"]')).toHaveCSS(
      'font-optical-sizing',
      browserName === 'webkit' ? 'none' : 'auto'
    )
  })
}
