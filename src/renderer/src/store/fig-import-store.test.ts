import { importFigFile, useFigImportStore } from './fig-import-store'
import { useDocumentStore } from './document-store'
import { MAX_FIG_BYTES, emptyFigWarnings } from '@shared/canvas/fig-types'
import { createEmptyDocument, defaultTextStyle } from '@shared/canvas/element-types'
import type { FigImportResult } from '@shared/canvas/fig-convert'
import type { FigImportRequest, FigImportResponse } from '@/lib/fig-import.worker'

class ImportWorker {
  static instances: ImportWorker[] = []
  onmessage: ((event: MessageEvent<FigImportResponse>) => void) | null = null
  onerror: (() => void) | null = null
  postMessage = vi.fn<(message: FigImportRequest, transfer?: Transferable[]) => void>()
  terminate = vi.fn()
  constructor() {
    ImportWorker.instances.push(this)
  }
  emit(message: FigImportResponse) {
    this.onmessage?.({ data: message } as MessageEvent<FigImportResponse>)
  }
}

const ready: FigImportResponse = {
  type: 'ready',
  name: 'Example',
  pages: [{ id: '0:1', name: 'Page', count: 1 }]
}
const result: FigImportResult = {
  pages: 1,
  assets: [],
  frameIds: ['frame'],
  warnings: emptyFigWarnings(),
  elements: [
    { id: 'frame', type: 'frame', name: 'Page', order: 0, x: 0, y: 0, width: 200, height: 100 },
    {
      id: 'text',
      type: 'text',
      text: 'Editable',
      textStyle: defaultTextStyle,
      x: 10,
      y: 10,
      width: 100,
      height: 28
    }
  ]
}
const file = () => new File(['figma'], 'example.fig')
const currentWorker = () => ImportWorker.instances.at(-1)!

beforeEach(() => {
  ImportWorker.instances = []
  vi.stubGlobal('Worker', ImportWorker)
  useDocumentStore.getState().loadDocument(createEmptyDocument(), null)
  useFigImportStore.getState().setMode('editable')
})

afterEach(() => {
  useFigImportStore.getState().hide()
  vi.unstubAllGlobals()
})

test('cancels immediately during file reading and ignores its late failure after another import opens', async () => {
  const pendingFile = file()
  let reject!: (reason: Error) => void
  vi.spyOn(pendingFile, 'arrayBuffer').mockReturnValue(
    new Promise((_, fail) => {
      reject = fail
    })
  )
  const firstClosed = importFigFile(pendingFile)
  const firstWorker = currentWorker()
  useFigImportStore.getState().hide()
  await firstClosed
  expect(firstWorker.terminate).toHaveBeenCalledOnce()

  const secondClosed = importFigFile(file())
  const secondWorker = currentWorker()
  secondWorker.emit(ready)
  reject(new Error('late read failure'))
  await Promise.resolve()
  expect(useFigImportStore.getState().phase).toBe('ready')
  expect(firstWorker.postMessage).not.toHaveBeenCalled()
  expect(secondWorker.terminate).not.toHaveBeenCalled()
  firstWorker.emit({ type: 'result', result })
  expect(useDocumentStore.getState().document.order).toEqual([])
  useFigImportStore.getState().hide()
  await secondClosed
})

test('inserts once, releases the worker and stores only the completion summary', async () => {
  const closed = importFigFile(file(), { x: 40, y: 60 })
  const worker = currentWorker()
  worker.emit(ready)
  useFigImportStore.getState().convert()
  expect(worker.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'convert',
      options: expect.objectContaining({ origin: { x: 40, y: 60 }, pages: ['0:1'] })
    })
  )
  worker.emit({ type: 'result', result })
  expect(useFigImportStore.getState()).toMatchObject({
    phase: 'done',
    summary: {
      pages: 1,
      elements: 2,
      texts: 1,
      warnings: emptyFigWarnings()
    }
  })
  expect(worker.terminate).toHaveBeenCalledOnce()
  expect(useDocumentStore.getState().selectedIds).toEqual(['frame'])
  useDocumentStore.getState().undo()
  expect(useDocumentStore.getState().document.order).toEqual([])
  worker.emit({ type: 'result', result })
  worker.onerror?.()
  expect(useDocumentStore.getState().document.order).toEqual([])
  expect(useFigImportStore.getState().phase).toBe('done')
  useDocumentStore.getState().redo()
  expect(useDocumentStore.getState().document.order).toEqual(['frame', 'text'])
  useFigImportStore.getState().hide()
  await closed
  expect(useFigImportStore.getState().summary).toBeNull()
})

test('rejects a result when the target document has changed and ignores a canceled conversion', () => {
  void importFigFile(file())
  const worker = currentWorker()
  worker.emit(ready)
  useFigImportStore.getState().convert()
  useDocumentStore.getState().loadDocument(createEmptyDocument(), null)
  worker.emit({ type: 'result', result })
  expect(useFigImportStore.getState()).toMatchObject({
    phase: 'error',
    error: 'FIG_DOCUMENT_CHANGED'
  })
  expect(worker.terminate).toHaveBeenCalledOnce()
  expect(useDocumentStore.getState().document.order).toEqual([])
  useFigImportStore.getState().hide()

  void importFigFile(file())
  const canceled = currentWorker()
  canceled.emit(ready)
  useFigImportStore.getState().convert()
  useFigImportStore.getState().hide()
  canceled.emit({ type: 'result', result })
  expect(useDocumentStore.getState().document.order).toEqual([])
})

test.each<FigImportResponse>([
  { type: 'error', code: 'FIG_INVALID' },
  { type: 'ready', name: 'Empty', pages: [] }
])('releases failed or empty imports without changing the document', (message) => {
  void importFigFile(file())
  const worker = currentWorker()
  worker.emit(message)
  expect(useFigImportStore.getState().phase).toBe('error')
  expect(worker.terminate).toHaveBeenCalledOnce()
  expect(useDocumentStore.getState().document.order).toEqual([])
})

test('rejects oversized files before creating a worker and prevents overlapping imports', async () => {
  const oversized = file()
  Object.defineProperty(oversized, 'size', { value: MAX_FIG_BYTES + 1 })
  const closed = importFigFile(oversized)
  expect(useFigImportStore.getState().error).toBe('FIG_LIMIT')
  await importFigFile(file())
  expect(ImportWorker.instances).toEqual([])
  useFigImportStore.getState().hide()
  await closed
})
