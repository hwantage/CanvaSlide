import { expect, test, type Page } from '@playwright/test'
import { createEmptyDocument, defaultTextStyle } from '../../src/shared/canvas/element-types'
import { serializeDocument } from '../../src/shared/canvas/document-file'
import { primaryModifier } from './canvas-gestures'

const prompt = (page: Page) => page.getByRole('dialog', { name: 'Recover unsaved work' })
async function seed(page: Page, count = 1, version = 1) {
  await page.goto('/__checkout')
  const records = Array.from({ length: count }, (_, i) => ({
    id: `lost-${i}`,
    info: { version, file: null, documentName: `Lost ${i}`, savedAt: i + 1000 },
    contents: serializeDocument(createEmptyDocument(`Lost ${i}`))
  }))
  await page.evaluate(async (records) => {
    const path = '/src/platform/recovery-database.ts'
    const database = await import(path)
    for (const record of records) {
      await database.writeStoredSnapshot(
        record.id,
        new TextEncoder().encode(JSON.stringify({ ...record.info, contents: record.contents })),
        record.info
      )
    }
  }, records)
}
async function ids(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const path = '/src/platform/recovery-database.ts'
    return (await import(path)).listStoredSessions()
  })
}

type PendingOpenWindow = Window & { finishOpenRead?: () => void; openDecoded?: boolean }

test('renderer text remeasurement does not cancel a delayed Open @core-interaction', async ({
  page
}) => {
  const current = createEmptyDocument('Measured document')
  current.order = ['measured-text']
  current.elements['measured-text'] = {
    id: 'measured-text',
    type: 'text',
    text: 'Hello',
    x: 0,
    y: 0,
    width: 200,
    height: 10,
    textStyle: defaultTextStyle
  }
  await page.goto('/')
  const firstChooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Open / }).click()
  await (
    await firstChooser
  ).setFiles({
    name: 'Current.canvaslide',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeDocument(current))
  })
  const text = page.locator('[data-element-id="measured-text"]')
  await expect(text).toBeVisible()
  await expect(text).not.toHaveCSS('min-height', '10px')
  await page.evaluate(() => {
    const arrayBuffer = File.prototype.arrayBuffer
    File.prototype.arrayBuffer = async function () {
      if (this.name === 'Chosen.canvaslide') {
        await new Promise<void>((resolve) => {
          ;(window as PendingOpenWindow).finishOpenRead = resolve
        })
      }
      return arrayBuffer.call(this)
    }
  })
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Open / }).click()
  await (
    await chooser
  ).setFiles({
    name: 'Chosen.canvaslide',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeDocument(createEmptyDocument('Chosen')))
  })
  await expect
    .poll(() => page.evaluate(() => typeof (window as PendingOpenWindow).finishOpenRead))
    .toBe('function')
  // Force real ResizeObserver delivery while the file read is pending, without editing content.
  await page.addStyleTag({
    content: '[data-element-id="measured-text"] > div { line-height: 100px !important; }'
  })
  await expect(text).toHaveCSS('min-height', '100px')
  await expect(page).toHaveTitle('Measured document — CanvaSlide')
  await page.evaluate(() => (window as PendingOpenWindow).finishOpenRead!())
  await expect(page).toHaveTitle('Chosen — CanvaSlide')
})

test('a delayed Open cannot replace restored work or delete its recovery copy @core-interaction', async ({
  page
}) => {
  await seed(page)
  await page.goto('/')
  await prompt(page).getByRole('button', { name: 'Later', exact: true }).click()
  await page.evaluate(() => {
    const state = window as PendingOpenWindow
    const arrayBuffer = File.prototype.arrayBuffer
    File.prototype.arrayBuffer = async function () {
      if (this.name === 'Other.canvaslide') {
        await new Promise<void>((resolve) => {
          state.finishOpenRead = resolve
        })
      }
      return arrayBuffer.call(this)
    }
    const NativeWorker = window.Worker
    window.Worker = class extends NativeWorker {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args)
        this.addEventListener('message', ({ data }) => {
          if (data.kind === 'decoded' && data.result.document?.name === 'Other') {
            state.openDecoded = true
          }
        })
      }
    }
  })
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Open / }).click()
  await (
    await chooser
  ).setFiles({
    name: 'Other.canvaslide',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeDocument(createEmptyDocument('Other')))
  })
  await expect
    .poll(() => page.evaluate(() => typeof (window as PendingOpenWindow).finishOpenRead))
    .toBe('function')
  await page.getByRole('button', { name: /^Settings/ }).click()
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await prompt(page).getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(page).toHaveTitle('• Lost 0 — CanvaSlide')
  await page.evaluate(() => (window as PendingOpenWindow).finishOpenRead!())
  await expect.poll(() => page.evaluate(() => (window as PendingOpenWindow).openDecoded)).toBe(true)
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
  )
  await expect(page).toHaveTitle('• Lost 0 — CanvaSlide')
  const retained = await page.evaluate(async () => {
    const path = '/src/platform/recovery-database.ts'
    const database = await import(path)
    const records = await Promise.all(
      (await database.listStoredSessions()).map((id: string) => database.readStoredMetadata(id))
    )
    return records.map((record: { info: { documentName: string } }) => record.info.documentName)
  })
  expect(retained).toContain('Lost 0')
})

test('exclusive claims protect offered and adopted work from a second recovery consumer @core-interaction', async ({
  page,
  context
}) => {
  await seed(page)
  await page.goto('/')
  await expect(prompt(page)).toBeVisible()
  const second = await context.newPage()
  await second.goto('/')
  await second.getByRole('button', { name: /^Settings/ }).click()
  await expect(second.getByRole('button', { name: 'Check recovery copies again' })).toBeEnabled()
  await expect(prompt(second)).toHaveCount(0)
  expect(await ids(second)).toContain('lost-0')
  await prompt(page).getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(page).toHaveTitle('• Lost 0 — CanvaSlide')
  await second.getByRole('button', { name: 'Check recovery copies again' }).click()
  await expect(prompt(second)).toHaveCount(0)
  expect(await ids(second)).toContain('lost-0')
  const download = page.waitForEvent('download')
  await page.keyboard.press(`${await primaryModifier(page)}+s`)
  await download
  await expect.poll(() => ids(second)).toEqual([])
})

test('five prompts never discard the sixth unanswered session and Later returns to the editor @core-interaction', async ({
  page
}) => {
  await seed(page, 7)
  await page.goto('/')
  await expect(prompt(page)).toContainText('(5 left)')
  expect(await ids(page)).toHaveLength(7)
  await prompt(page).getByRole('button', { name: 'Later' }).click()
  await expect(prompt(page)).toHaveCount(0)
  await page.getByRole('button', { name: /^Settings/ }).click()
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  for (let i = 6; i >= 2; i--) {
    await expect(prompt(page)).toContainText(`Lost ${i}`)
    await prompt(page).getByRole('button', { name: 'Discard', exact: true }).click()
  }
  await expect(prompt(page)).toHaveCount(0)
  expect(await ids(page)).toEqual(['lost-0', 'lost-1'])
})

test('unknown versions stay quarantined across reload and can only be explicitly discarded @core-interaction', async ({
  page
}) => {
  await seed(page, 1, 99)
  await page.goto('/')
  await expect(prompt(page).getByRole('button', { name: 'Restore', exact: true })).toBeDisabled()
  expect(await ids(page)).toEqual(['lost-0'])
  await prompt(page).getByRole('button', { name: 'Later' }).click()
  await page.reload()
  await expect(prompt(page)).toBeVisible()
  expect(await ids(page)).toEqual(['lost-0'])
  await prompt(page).getByRole('button', { name: 'Discard', exact: true }).click()
  await expect.poll(() => ids(page)).toEqual([])
})

test('ordinary browser unload retains the last persisted copy without relying on confirmation @core-interaction', async ({
  page
}) => {
  await seed(page)
  await page.goto('/')
  await prompt(page).getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(page).toHaveTitle('• Lost 0 — CanvaSlide')
  page.on('dialog', (dialog) => void dialog.accept())
  await page.reload()
  await expect(prompt(page)).toBeVisible()
  await expect(prompt(page)).toContainText('Lost 0')
})

test('metadata scan never reads or parses a payload in the renderer @core-interaction', async ({
  page
}) => {
  await seed(page)
  const result = await page.evaluate(async () => {
    const path = '/src/platform/recovery-storage.ts'
    const storage = await import(path)
    const originalParse = JSON.parse,
      originalGet = IDBObjectStore.prototype.get
    let reads = 0,
      envelopeParses = 0
    IDBObjectStore.prototype.get = function (...args: Parameters<typeof originalGet>) {
      if (this.name === 'payloads') {
        reads++
      }
      return originalGet.apply(this, args)
    }
    JSON.parse = (text, reviver) => {
      if (text.includes('contents')) {
        envelopeParses++
      }
      return originalParse(text, reviver)
    }
    try {
      const found = await storage.readRecoverySnapshots()
      return {
        reads,
        envelopeParses,
        names: found.sessions.map(
          (s: { snapshot: { documentName: string } }) => s.snapshot.documentName
        )
      }
    } finally {
      JSON.parse = originalParse
      IDBObjectStore.prototype.get = originalGet
    }
  })
  expect(result).toEqual({ reads: 0, envelopeParses: 0, names: ['Lost 0'] })
})

test('aborted IndexedDB replacement keeps prior payload and metadata atomically and requests strict durability @core-interaction', async ({
  page
}) => {
  await seed(page)
  const result = await page.evaluate(async () => {
    const path = '/src/platform/recovery-database.ts'
    const db = await import(path)
    const put = IDBObjectStore.prototype.put
    let durability: string | undefined
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
      durability = this.transaction.durability
      const result = put.apply(this, args)
      this.transaction.abort()
      return result
    }
    let failed = false
    try {
      await db.writeStoredSnapshot('lost-0', new TextEncoder().encode('replacement'), {
        version: 1,
        file: null,
        savedAt: 9999,
        documentName: 'replacement'
      })
    } catch {
      failed = true
    } finally {
      IDBObjectStore.prototype.put = put
    }
    const old = await db.readStoredSnapshot('lost-0')
    return {
      failed,
      durability,
      name: old.info.documentName,
      payload: JSON.parse(new TextDecoder().decode(old.payload)).documentName
    }
  })
  expect(result).toEqual({ failed: true, durability: 'strict', name: 'Lost 0', payload: 'Lost 0' })
})

test('record quota refuses new writes without evicting any unanswered work @core-interaction', async ({
  page
}) => {
  await seed(page)
  const result = await page.evaluate(async () => {
    const path = '/src/platform/recovery-database.ts'
    const db = await import(path)
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('canvaslide-recovery', 2)
      open.onsuccess = () => {
        const tx = open.result.transaction('snapshots', 'readwrite')
        for (let i = 1; i < 1000; i++) {
          const info = { version: 1, file: null, documentName: 'old', savedAt: 1 }
          tx.objectStore('snapshots').put({ info, bytes: 1 }, `extra-${i}`)
        }
        tx.oncomplete = () => {
          open.result.close()
          resolve()
        }
        tx.onabort = () => reject(tx.error)
      }
    })
    let failed = false
    try {
      await db.writeStoredSnapshot('extra', new Uint8Array([1]), {
        version: 1,
        file: null,
        documentName: 'new',
        savedAt: 1
      })
    } catch {
      failed = true
    }
    return { failed, ids: await db.listStoredSessions() }
  })
  expect(result.failed).toBe(true)
  expect(result.ids).toHaveLength(1000)
  expect(result.ids).toContain('lost-0')
  expect(result.ids).not.toContain('extra')
})

test('worker serializes bytes and rejects corrupt and future envelopes @core-interaction', async ({
  page
}) => {
  await page.goto('/__checkout')
  const result = await page.evaluate(async (document) => {
    const path = '/src/lib/document-file-codec.ts'
    const codec = await import(path)
    const meta = { file: null, documentName: document.name, savedAt: 1000 }
    const bytes = await codec.encodeRecoverySnapshot(document, meta)
    const transferable = bytes instanceof Uint8Array
    const decoded = await codec.decodeRecoveryFile(bytes)
    const detached = bytes.byteLength === 0
    const encode = (text: string) => new TextEncoder().encode(text)
    const future = await codec.decodeRecoveryFile(
      encode(JSON.stringify({ ...meta, version: 99, contents: JSON.stringify(document) }))
    )
    const corrupt = await codec.decodeRecoveryFile(encode('not json'))
    return {
      transferable,
      detached,
      name: decoded.result.document.name,
      future: { ok: future.result.ok, snapshot: future.snapshot },
      corrupt: corrupt.result.ok
    }
  }, createEmptyDocument('Worker deck'))
  expect(result).toEqual({
    transferable: true,
    detached: true,
    name: 'Worker deck',
    future: { ok: false, snapshot: null },
    corrupt: false
  })
})

test('live malformed and future envelopes are skipped before inspection @core-interaction', async ({
  page,
  context
}) => {
  await seed(page, 1, 99)
  await page.evaluate(async () => {
    const path = '/src/platform/recovery-session.ts'
    await (await import(path)).claimRecoverySession('lost-0')
  })
  const second = await context.newPage()
  await second.goto('/')
  await second.getByRole('button', { name: /^Settings/ }).click()
  const check = second.getByRole('button', { name: 'Check recovery copies again' })
  await expect(check).toBeEnabled()
  await expect(prompt(second)).toHaveCount(0)
  expect(await ids(second)).toEqual(['lost-0'])
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const open = indexedDB.open('canvaslide-recovery', 2)
      open.onsuccess = () => {
        const tx = open.result.transaction('snapshots', 'readwrite')
        tx.objectStore('snapshots').put('malformed', 'lost-0')
        tx.oncomplete = () => {
          open.result.close()
          resolve()
        }
      }
    })
  })
  await check.click()
  await expect(prompt(second)).toHaveCount(0)
  expect(await ids(second)).toEqual(['lost-0'])
  await page.close()
  await check.click()
  await expect(prompt(second)).toBeVisible()
  await expect(prompt(second).getByRole('button', { name: 'Restore', exact: true })).toBeDisabled()
})

test('transient restore read failure preserves the actual record and Retry succeeds @core-interaction', async ({
  page
}) => {
  await seed(page)
  await page.goto('/')
  await expect(prompt(page)).toBeVisible()
  await page.evaluate(() => {
    const get = IDBObjectStore.prototype.get
    IDBObjectStore.prototype.get = function (...args: Parameters<typeof get>) {
      IDBObjectStore.prototype.get = get
      const request = get.apply(this, args)
      this.transaction.abort()
      return request
    }
  })
  await prompt(page).getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(prompt(page).getByRole('alert')).toBeVisible()
  expect(await ids(page)).toEqual(['lost-0'])
  await prompt(page).getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(page).toHaveTitle('• Lost 0 — CanvaSlide')
})

test('restore serializes prompt actions while the document worker is loading @core-interaction', async ({
  page
}) => {
  await seed(page)
  await page.goto('/')
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/document-file.worker.ts*', async (route) => {
    await gate
    await route.continue()
  })
  await prompt(page).getByRole('button', { name: 'Restore', exact: true }).click()
  for (const name of ['Restore', 'Discard', 'Later']) {
    await expect(prompt(page).getByRole('button', { name, exact: true })).toBeDisabled()
  }
  expect(await ids(page)).toEqual(['lost-0'])
  release()
  await expect(page).toHaveTitle('• Lost 0 — CanvaSlide')
})

test('failed launch scanning is visible and a real subsequent scan can recover @core-interaction', async ({
  page
}) => {
  await seed(page)
  await page.addInitScript(() => {
    const open = IDBFactory.prototype.open
    IDBFactory.prototype.open = function () {
      IDBFactory.prototype.open = open
      throw new DOMException('temporarily unavailable', 'UnknownError')
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: /^Settings/ }).click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await expect(settings.getByText(/Some recovery copies could not be checked/)).toBeVisible()
  await settings.getByRole('button', { name: 'Check recovery copies again' }).click()
  await expect(prompt(page)).toContainText('Lost 0')
})

test('partial scan errors stay visible alongside a readable recovery offer @core-interaction', async ({
  page
}) => {
  await seed(page, 2)
  await page.addInitScript(() => {
    const get = IDBObjectStore.prototype.get
    IDBObjectStore.prototype.get = function (...args: Parameters<typeof get>) {
      const request = get.apply(this, args)
      if (this.name === 'snapshots' && args[0] === 'lost-1') {
        this.transaction.abort()
      }
      return request
    }
  })
  await page.goto('/')
  await expect(prompt(page)).toContainText('Lost 0')
  await expect(prompt(page).getByRole('alert')).toContainText(
    'Some recovery copies could not be checked'
  )
  await prompt(page).getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(page).toHaveTitle('• Lost 0 — CanvaSlide')
  expect(await ids(page)).toContain('lost-1')
})
