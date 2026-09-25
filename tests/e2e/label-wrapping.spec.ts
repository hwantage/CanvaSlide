import { pathToFileURL } from 'node:url'
import { expect, test, type Locator } from '@playwright/test'
import { appModuleUrl } from './app-module'
import { waitForEditor } from './editor-ready'

/** Lines each label's text occupies, measured inside its own padding. */
async function labelLines(labels: Locator): Promise<Record<string, number>> {
  const entries = await labels.evaluateAll((nodes) =>
    nodes.map((node) => {
      const style = getComputedStyle(node)
      const content =
        (node as HTMLElement).offsetHeight -
        Number.parseFloat(style.paddingTop) -
        Number.parseFloat(style.paddingBottom)
      const lines = Math.round(content / Number.parseFloat(style.lineHeight))
      return [node.textContent ?? '', lines] as const
    })
  )
  return Object.fromEntries(entries)
}

test('exported HTML wraps shape and connector labels where the editor does @webkit', async ({
  page
}, testInfo) => {
  await page.goto('/')
  await waitForEditor(page)
  await page.evaluate(async (url) => {
    const { useDocumentStore } = await import(url)
    const store = useDocumentStore.getState()
    const textStyle = { color: '#18181b', fontSize: 14, align: 'center', bold: false }
    const line = (id: string, from: [number, number], to: [number, number], label: string) => ({
      id,
      type: 'connector',
      x: Math.min(from[0], to[0]),
      y: Math.min(from[1], to[1]),
      width: Math.max(1, Math.abs(to[0] - from[0])),
      height: Math.max(1, Math.abs(to[1] - from[1])),
      start: { x: from[0], y: from[1] },
      end: { x: to[0], y: to[1] },
      route: 'straight',
      startHead: 'none',
      endHead: 'arrow',
      style: { stroke: '#52525b', strokeWidth: 2, dashed: false },
      label,
      textStyle: id === 'large' ? { ...textStyle, fontSize: 64 } : textStyle
    })
    const elements = {
      frame: {
        id: 'frame',
        type: 'frame',
        x: 0,
        y: 0,
        width: 1000,
        height: 700,
        name: 'F',
        order: 0
      },
      // Room for the text only once the editor's label padding is taken off, not the export's.
      shape: {
        id: 'shape',
        type: 'shape',
        shape: 'rectangle',
        x: 600,
        y: 450,
        width: 200,
        height: 100,
        style: { fill: '#dbeafe', stroke: '#2563eb', strokeWidth: 2, cornerRadius: 8 },
        text: 'nnnnnnnnnniiiiiiiiiiiiiiii',
        textStyle: { ...textStyle, fontSize: 20 }
      },
      // A vertical and a short line leave the label little room; one label breaks by hand.
      vertical: line('vertical', [100, 50], [100, 500], 'Vertical label'),
      long: line('long', [200, 100], [300, 100], 'A label long enough to pass its maximum width'),
      breaks: line('breaks', [200, 300], [700, 300], 'First line\nsecond line'),
      large: line('large', [300, 400], [300, 650], 'Approved')
    }
    store.loadDocument({ ...store.document, elements, order: Object.keys(elements) }, null)
  }, appModuleUrl('store/document-store.ts'))
  const expected = {
    'Vertical label': 1,
    'A label long enough to pass its maximum width': 2,
    'First line\nsecond line': 2,
    Approved: 1,
    nnnnnnnnnniiiiiiiiiiiiiiii: 1
  }
  const editorLabels = page.locator(
    '[data-element-type="connector"] > div > div, [data-element-type="shape"] > div > div'
  )
  await expect(editorLabels).toHaveCount(5)
  const editor = await labelLines(editorLabels)
  expect(editor).toEqual(expected)

  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await page.getByRole('button', { name: 'Export HTML', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Export presentation' })
  await expect(dialog.getByTestId('export-size')).not.toContainText('calculating', {
    timeout: 10_000
  })
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export…' }).click()
  const file = testInfo.outputPath('labels.html')
  await (await download).saveAs(file)
  const player = await page.context().newPage()
  await player.goto(pathToFileURL(file).href)
  await expect(player.getByTestId('presentation-counter')).toContainText('1 / 1')
  const exported = await labelLines(player.locator('.uc-connector-label, .uc-shape-label > div'))
  expect(exported).toEqual(editor)
})
