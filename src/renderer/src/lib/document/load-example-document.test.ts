import { createEmptyDocument, type CanvasDocument } from '@shared/canvas/element-types'
import { cameraForOpenedDocument } from '@shared/canvas/frame-fit'
import { fetchExampleDocument } from '@/platform/example-document'
import type * as ExampleModule from '@/platform/example-document'
import { useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'
import { loadExampleDocument } from './load-example-document'

vi.mock('@/platform/example-document', async (original) => ({
  ...(await original<typeof ExampleModule>()),
  fetchExampleDocument: vi.fn()
}))
vi.mock('@/store/presentation-store', () => ({
  usePresentationStore: { getState: () => ({ exit: vi.fn() }) }
}))

const document = { ...createEmptyDocument(), name: 'Example' }
beforeEach(() => {
  vi.clearAllMocks()
  useDocumentStore.getState().loadDocument(createEmptyDocument(), null)
  useCameraStore.getState().setViewport({ width: 1000, height: 800 })
})

it('opens a local editable copy with a clean history and content fitted', async () => {
  vi.mocked(fetchExampleDocument).mockResolvedValue(document)
  await loadExampleDocument('flowchart', new AbortController().signal)
  expect(useDocumentStore.getState()).toMatchObject({
    document,
    filePath: null,
    dirty: false,
    past: [],
    future: []
  })
  expect(useCameraStore.getState().camera).toEqual(
    cameraForOpenedDocument(document, { width: 1000, height: 800 })
  )
})

it.each(['edit', 'undo', 'open', 'begin-edit', 'cancel'] as const)(
  'keeps newer work during a delayed response: %s',
  async (action) => {
    let finish!: (document: CanvasDocument) => void
    vi.mocked(fetchExampleDocument).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const controller = new AbortController()
    const task = loadExampleDocument('flowchart', controller.signal)
    const store = useDocumentStore.getState()
    if (action === 'edit' || action === 'undo') {
      store.renameDocument('My work')
    }
    if (action === 'undo') {
      useDocumentStore.getState().undo()
    }
    if (action === 'open') {
      store.loadDocument(createEmptyDocument(), null)
    }
    if (action === 'begin-edit') {
      store.beginEdit()
    }
    if (action === 'cancel') {
      controller.abort()
    }
    const current = useDocumentStore.getState().document
    finish(document)
    await (action === 'cancel' ? task : expect(task).rejects.toMatchObject({ code: 'changed' }))
    expect(useDocumentStore.getState().document).toBe(current)
  }
)

it('loads after an edit gesture that ended without changing anything', async () => {
  let finish!: (document: CanvasDocument) => void
  vi.mocked(fetchExampleDocument).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const task = loadExampleDocument('flowchart', new AbortController().signal)
  useDocumentStore.getState().beginEdit()
  useDocumentStore.getState().endEdit()
  finish(document)
  await task
  expect(useDocumentStore.getState().document).toBe(document)
})

it('refuses a retry over unsaved work', async () => {
  useDocumentStore.getState().renameDocument('Unsaved')
  await expect(
    loadExampleDocument('flowchart', new AbortController().signal)
  ).rejects.toMatchObject({ code: 'changed' })
  expect(fetchExampleDocument).not.toHaveBeenCalled()
})
