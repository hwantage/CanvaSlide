import {
  createEmptyDocument,
  defaultTextStyle,
  type CanvasDocument
} from '@shared/canvas/element-types'
import { cameraForOpenedDocument } from '@shared/canvas/frame-fit'
import { fetchCloudShare } from '@/platform/cloud-share'
import { useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'
import { usePresentationStore } from '@/store/presentation-store'
import { loadSharedDocument } from './load-shared-document'
import type { SharedSnapshot } from '@shared/cloud-share'

vi.mock('@/platform/cloud-share', () => ({ fetchCloudShare: vi.fn() }))
vi.mock('@/store/presentation-store', () => ({
  usePresentationStore: { getState: () => ({ exit: vi.fn() }) }
}))

const id = 'abcdefghijklmnopqr_-1'
let document: CanvasDocument

beforeEach(() => {
  vi.clearAllMocks()
  useDocumentStore.getState().loadDocument(createEmptyDocument(), null)
  useCameraStore.getState().setViewport({ width: 1100, height: 800 })
  document = {
    ...createEmptyDocument(),
    name: 'Shared board',
    camera: { x: -99999, y: -99999, zoom: 64 },
    elements: {
      frame: {
        id: 'frame',
        type: 'frame',
        name: 'Frame',
        order: 0,
        x: 5000,
        y: 3000,
        width: 1200,
        height: 800
      }
    },
    order: ['frame']
  }
})

it('loads the shared document without a local path, resets history, and fits actual content', async () => {
  vi.mocked(fetchCloudShare).mockResolvedValue({ access: 'edit', document })
  const exit = vi.spyOn(usePresentationStore, 'getState')
  await loadSharedDocument(id, new AbortController().signal)
  expect(exit).toHaveBeenCalled()
  expect(useDocumentStore.getState()).toMatchObject({
    document,
    filePath: null,
    dirty: false,
    past: [],
    future: []
  })
  expect(useCameraStore.getState().camera).toEqual(
    cameraForOpenedDocument(document, { width: 1100, height: 800 })
  )
})

it('returns a presentation without loading its document into the still-mounted editor', async () => {
  const before = useDocumentStore.getState().document
  vi.mocked(fetchCloudShare).mockResolvedValue({ access: 'present', document })
  await expect(loadSharedDocument(id, new AbortController().signal)).resolves.toEqual({
    access: 'present',
    document
  })
  expect(useDocumentStore.getState().document).toBe(before)
})

it('leaves the current document and camera intact on a failed download', async () => {
  const before = useDocumentStore.getState().document
  const camera = useCameraStore.getState().camera
  vi.mocked(fetchCloudShare).mockRejectedValue(new Error('offline'))
  await expect(loadSharedDocument(id, new AbortController().signal)).rejects.toThrow('offline')
  expect(useDocumentStore.getState().document).toBe(before)
  expect(useCameraStore.getState().camera).toBe(camera)
})

it.each(['edit', 'open', 'cancel'] as const)(
  'does not overwrite work after a delayed response: %s',
  async (action) => {
    let finish!: (value: SharedSnapshot) => void
    vi.mocked(fetchCloudShare).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const controller = new AbortController()
    const task = loadSharedDocument(id, controller.signal)
    if (action === 'edit') {
      useDocumentStore.getState().renameDocument('Keep my work')
    } else if (action === 'open') {
      useDocumentStore.getState().loadDocument(createEmptyDocument(), null)
    } else {
      controller.abort()
    }
    const current = useDocumentStore.getState().document
    finish({ access: 'edit', document })
    await (action === 'cancel' ? task : expect(task).rejects.toMatchObject({ code: 'changed' }))
    expect(useDocumentStore.getState().document).toBe(current)
  }
)

it('is not cancelled by a text remeasurement during the download', async () => {
  const current = createEmptyDocument('Current')
  current.order = ['text']
  current.elements.text = {
    id: 'text',
    type: 'text',
    text: 'Hello',
    x: 0,
    y: 0,
    width: 100,
    height: 10,
    textStyle: defaultTextStyle
  }
  useDocumentStore.getState().loadDocument(current, null)
  let finish!: (value: SharedSnapshot) => void
  vi.mocked(fetchCloudShare).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const task = loadSharedDocument(id, new AbortController().signal)
  useDocumentStore.getState().syncTextHeight('text', 200)
  finish({ access: 'edit', document })
  await expect(task).resolves.toEqual({ access: 'edit', document })
  expect(useDocumentStore.getState().document).toBe(document)
})

it('refuses to replace unsaved work when retrying a link', async () => {
  useDocumentStore.getState().renameDocument('Unsaved')
  await expect(loadSharedDocument(id, new AbortController().signal)).rejects.toMatchObject({
    code: 'changed'
  })
  expect(fetchCloudShare).not.toHaveBeenCalled()
})
