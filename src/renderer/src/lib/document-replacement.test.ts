import {
  createEmptyDocument,
  defaultTextStyle,
  type CanvasDocument
} from '@shared/canvas/element-types'
import { cameraForOpenedDocument } from '@shared/canvas/frame-fit'
import { confirmDiscardChanges, type OpenedDocument } from '@/platform/document-file-access'
import { useCameraStore } from '@/store/camera-store'
import { useCloudShareStore } from '@/store/cloud-share-store'
import { useDocumentStore } from '@/store/document-store'
import { useExampleStore } from '@/store/example-store'
import { usePresentationStore } from '@/store/presentation-store'
import { loadReplacement, replaceDocument, type Placement } from './document-replacement'

vi.mock('@/platform/document-file-access', () => ({ confirmDiscardChanges: vi.fn() }))

const viewport = { width: 1000, height: 800 }
const savedCamera = { x: -99999, y: -99999, zoom: 64 }
const board: CanvasDocument = {
  ...createEmptyDocument('Board'),
  camera: savedCamera,
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
const opened: OpenedDocument = { document: board, filePath: '/tmp/board.canvaslide' }
const fit = { camera: 'fit' } as const

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(confirmDiscardChanges).mockResolvedValue(true)
  useDocumentStore.getState().loadDocument(createEmptyDocument(), null)
  useCameraStore.getState().setViewport(viewport)
  useCameraStore.getState().setCamera({ x: 1, y: 2, zoom: 1 })
  usePresentationStore.setState({ active: false, cameraBeforeStart: null })
  useExampleStore.setState({ open: false, busy: false, error: null })
  useCloudShareStore.setState({ open: false, mode: 'publish', busy: false })
  window.history.replaceState(null, '', '/?lang=en')
})

describe('replaceDocument', () => {
  it('loads a replacement the author chose with a clean history, fitted, outside presentation', async () => {
    useDocumentStore.getState().renameDocument('Old')
    usePresentationStore.setState({ active: true })
    await expect(
      replaceDocument({ read: async () => opened, onDirty: 'ask', load: fit })
    ).resolves.toBe('replaced')
    expect(confirmDiscardChanges).toHaveBeenCalledTimes(1)
    expect(useDocumentStore.getState()).toMatchObject({
      document: board,
      filePath: '/tmp/board.canvaslide',
      dirty: false,
      past: [],
      future: []
    })
    expect(useCameraStore.getState().camera).toEqual(cameraForOpenedDocument(board, viewport))
    expect(usePresentationStore.getState().active).toBe(false)
  })

  it('keeps unsaved work the author declines to discard, without reading', async () => {
    useDocumentStore.getState().renameDocument('Mine')
    vi.mocked(confirmDiscardChanges).mockResolvedValue(false)
    const read = vi.fn(async () => opened)
    await expect(replaceDocument({ read, onDirty: 'ask', load: fit })).resolves.toBe('declined')
    expect(read).not.toHaveBeenCalled()
    expect(useDocumentStore.getState().document.name).toBe('Mine')
  })

  it.each([
    ['refuse', 'unsaved work'],
    ['refuse', 'an edit gesture'],
    ['ask', 'an edit gesture'],
    ['ask', 'an edit gesture in unsaved work']
  ] as const)('%s: keeps %s without asking or reading', async (onDirty, state) => {
    const store = useDocumentStore.getState()
    if (state !== 'an edit gesture') {
      store.renameDocument('Mine')
    }
    if (state !== 'unsaved work') {
      store.beginEdit()
    }
    const current = useDocumentStore.getState().document
    const read = vi.fn(async () => opened)
    await expect(replaceDocument({ read, onDirty, load: fit })).resolves.toBe('refused')
    expect(read).not.toHaveBeenCalled()
    expect(confirmDiscardChanges).not.toHaveBeenCalled()
    expect(useDocumentStore.getState().document).toBe(current)
  })

  it('does not read after the document changed during the confirmation', async () => {
    useDocumentStore.getState().renameDocument('Mine')
    const answer = deferred<boolean>()
    vi.mocked(confirmDiscardChanges).mockReturnValue(answer.promise)
    const read = vi.fn(async () => opened)
    const task = replaceDocument({ read, onDirty: 'ask', load: fit })
    useDocumentStore.getState().renameDocument('Still mine')
    answer.resolve(true)
    await expect(task).resolves.toBe('changed')
    expect(read).not.toHaveBeenCalled()
    expect(useDocumentStore.getState().document.name).toBe('Still mine')
  })

  it.each(['ask', 'refuse'] as const)(
    '%s: keeps work that changed while reading',
    async (onDirty) => {
      for (const change of ['edit', 'edit then undo', 'replace', 'begin edit'] as const) {
        useDocumentStore.getState().loadDocument(createEmptyDocument(), null)
        const reading = deferred<OpenedDocument>()
        const task = replaceDocument({ read: () => reading.promise, onDirty, load: fit })
        const store = useDocumentStore.getState()
        if (change === 'replace') {
          store.loadDocument(createEmptyDocument('Other'), null)
        } else if (change === 'begin edit') {
          store.beginEdit()
        } else {
          store.renameDocument('Mine')
          if (change === 'edit then undo') {
            useDocumentStore.getState().undo()
          }
        }
        const current = useDocumentStore.getState().document
        reading.resolve(opened)
        await expect(task, change).resolves.toBe('changed')
        expect(useDocumentStore.getState().document, change).toBe(current)
        useDocumentStore.getState().cancelEdit()
      }
    }
  )

  it.each(['ask', 'refuse'] as const)(
    '%s: is not cancelled by a text remeasurement while reading',
    async (onDirty) => {
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
      const reading = deferred<OpenedDocument>()
      const task = replaceDocument({ read: () => reading.promise, onDirty, load: fit })
      useDocumentStore.getState().syncTextHeight('text', 200)
      reading.resolve(opened)
      await expect(task).resolves.toBe('replaced')
      expect(useDocumentStore.getState().document).toBe(board)
    }
  )

  it('leaves everything in place when there is nothing to load', async () => {
    const before = useDocumentStore.getState()
    const camera = useCameraStore.getState().camera
    await expect(
      replaceDocument({ read: async () => null, onDirty: 'ask', load: fit })
    ).resolves.toBe('cancelled')
    expect(useDocumentStore.getState()).toBe(before)
    expect(useCameraStore.getState().camera).toBe(camera)
  })

  it('leaves the document to a caller that loads it later', async () => {
    const before = useDocumentStore.getState().document
    const load = vi.fn()
    await expect(
      replaceDocument({ read: async () => opened, onDirty: 'refuse', load })
    ).resolves.toBe('replaced')
    expect(load).toHaveBeenCalledWith(opened)
    expect(useDocumentStore.getState().document).toBe(before)
  })

  it('passes a failed read to the caller', async () => {
    const before = useDocumentStore.getState().document
    const failure = replaceDocument({
      read: () => Promise.reject(new Error('offline')),
      onDirty: 'ask',
      load: fit
    })
    await expect(failure).rejects.toThrow('offline')
    expect(useDocumentStore.getState().document).toBe(before)
  })
})

describe('loadReplacement', () => {
  it.each<[Placement['camera'], CanvasDocument, () => unknown]>([
    ['fit', board, () => cameraForOpenedDocument(board, viewport)],
    ['saved', board, () => savedCamera],
    [
      'saved',
      { ...board, camera: undefined },
      () => cameraForOpenedDocument({ ...board, camera: undefined }, viewport)
    ],
    ['keep', board, () => ({ x: 1, y: 2, zoom: 1 })]
  ])('places the camera: %s', (camera, document, expected) => {
    loadReplacement({ document, filePath: null }, { camera })
    expect(useCameraStore.getState().camera).toEqual(expected())
  })

  it('opens recovered work as unsaved, with no copy on disk', () => {
    loadReplacement(opened, { camera: 'saved', recovered: true })
    expect(useDocumentStore.getState()).toMatchObject({
      document: board,
      filePath: '/tmp/board.canvaslide',
      dirty: true,
      savedDocument: null
    })
  })

  it('drops launch links that no longer name the open document', () => {
    window.history.replaceState(null, '', '/?lang=en&share=abc&example=flowchart#canvas')
    useExampleStore.setState({ open: true, error: 'network' })
    loadReplacement(opened, fit)
    expect(window.location.search).toBe('?lang=en')
    expect(window.location.hash).toBe('#canvas')
    expect(useExampleStore.getState().open).toBe(false)
  })

  it('closes a share link that is still loading, and leaves publishing alone', () => {
    window.history.replaceState(null, '', '/?share=abc')
    useCloudShareStore.setState({ open: true, mode: 'load', busy: true })
    loadReplacement(opened, fit)
    expect(useCloudShareStore.getState()).toMatchObject({ open: false, busy: false })
    useCloudShareStore.setState({ open: true, mode: 'publish', busy: true })
    loadReplacement(opened, fit)
    expect(useCloudShareStore.getState()).toMatchObject({ open: true, busy: true })
  })

  it('keeps the launch link that named the document so a reload reopens it', () => {
    window.history.replaceState(null, '', '/?lang=en&share=abc&example=flowchart')
    useExampleStore.setState({ open: true, busy: true })
    useCloudShareStore.setState({ open: true, mode: 'load', busy: true })
    loadReplacement(opened, { camera: 'fit', keepLink: true })
    expect(window.location.search).toBe('?lang=en&share=abc&example=flowchart')
    expect(useExampleStore.getState().open).toBe(true)
    expect(useCloudShareStore.getState().open).toBe(true)
  })
})
