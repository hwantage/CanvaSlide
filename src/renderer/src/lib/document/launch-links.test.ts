import { useExampleStore } from '@/store/example-store'
import {
  cancelExampleRequest,
  cancelShareRequest,
  hideExampleDialog,
  hideShareDialog
} from './launch-link-session'
import { openExampleLink, openSharedLink, publishShare, showShareDialog } from './launch-links'
import { loadSharedDocument } from './load-shared-document'
import { useCloudShareStore } from '@/store/cloud-share-store'
import { useDocumentStore } from '@/store/document-store'
import { useCameraStore } from '@/store/camera-store'
import { createEmptyDocument } from '@shared/canvas/element-types'
import {
  CloudShareError,
  type ShareAccess,
  type SharedSnapshot
} from '@shared/cloud-share/share-protocol'
import { ExampleError } from '@/platform/example-document'
import { createCloudShare } from '@/platform/cloud-share'
import type * as CloudShare from '@/platform/cloud-share'
import { loadReplacement } from './document-replacement'
import { loadExampleDocument } from '@/lib/document/load-example-document'
import { isTauriRuntime } from '@/platform/tauri-runtime'
vi.mock('@/lib/document/load-example-document', () => ({ loadExampleDocument: vi.fn() }))
vi.mock('@/platform/tauri-runtime', () => ({ isTauriRuntime: vi.fn(() => false) }))
vi.mock('./load-shared-document', () => ({ loadSharedDocument: vi.fn() }))
vi.mock('@/platform/cloud-share', async (original) => ({
  ...(await original<typeof CloudShare>()),
  createCloudShare: vi.fn()
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

const shareSearch = '?share=abcdefghijklmnopqrstu'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(isTauriRuntime).mockReturnValue(false)
  useCloudShareStore.setState({
    open: false,
    mode: 'publish',
    busy: false,
    url: null,
    error: null,
    access: 'present',
    presentation: null
  })
  useDocumentStore.getState().loadDocument(createEmptyDocument(), null)
  window.history.replaceState(null, '', '/?lang=en#canvas')
  useExampleStore.setState({ open: false, busy: false, error: null })
})
afterEach(() => {
  cancelExampleRequest()
  cancelShareRequest()
})

it.each(['', '?example=flowchart&share=bad', '?share=bad'])(
  'preserves ordinary or shared startup: %s',
  async (search) => {
    await openExampleLink(search)
    expect(loadExampleDocument).not.toHaveBeenCalled()
    expect(useExampleStore.getState().open).toBe(false)
  }
)
it('ignores web examples in Tauri', async () => {
  vi.mocked(isTauriRuntime).mockReturnValueOnce(true)
  await openExampleLink('?example=flowchart')
  expect(loadExampleDocument).not.toHaveBeenCalled()
})
it('rejects duplicate example parameters without choosing one', async () => {
  await openExampleLink('?example=flowchart&example=erd')
  expect(loadExampleDocument).not.toHaveBeenCalled()
  expect(useExampleStore.getState()).toMatchObject({ open: true, busy: false, error: 'unknown' })
})
it('allows StrictMode cleanup followed by a fresh request', async () => {
  const signals: AbortSignal[] = []
  vi.mocked(loadExampleDocument).mockImplementation(async (_id, signal) => {
    signals.push(signal)
  })
  const first = openExampleLink('?example=flowchart')
  cancelExampleRequest()
  await first
  await openExampleLink('?example=flowchart')
  expect(signals.map((signal) => signal.aborted)).toEqual([true, false])
  expect(useExampleStore.getState()).toMatchObject({ open: false, busy: false })
})

it.each(['', '?share=another-link'])(
  'closes a pending example dialog when another entry takes ownership: %s',
  async (search) => {
    let finish!: () => void
    let signal!: AbortSignal
    vi.mocked(loadExampleDocument).mockImplementation((_id, request) => {
      signal = request
      return new Promise((resolve) => {
        finish = resolve
      })
    })
    const pending = openExampleLink('?example=flowchart')
    expect(useExampleStore.getState().busy).toBe(true)
    await openExampleLink(search)
    expect(signal.aborted).toBe(true)
    expect(useExampleStore.getState()).toMatchObject({ open: false, busy: false, error: null })
    finish()
    await pending
    expect(useExampleStore.getState().open).toBe(false)
  }
)

describe('shared links', () => {
  it('leaves state alone without a share query', async () => {
    const before = useCloudShareStore.getState()
    await openSharedLink('?lang=en')
    expect(useCloudShareStore.getState()).toBe(before)
    expect(loadSharedDocument).not.toHaveBeenCalled()
  })

  it.each(['?share=bad', `${shareSearch}&share=abcdefghijklmnopqrstu`])(
    'reports invalid input: %s',
    async (search) => {
      await openSharedLink(search)
      expect(loadSharedDocument).not.toHaveBeenCalled()
      expect(useCloudShareStore.getState()).toMatchObject({
        open: true,
        mode: 'load',
        busy: false,
        error: 'invalid'
      })
    }
  )

  it.each<ShareAccess>(['edit', 'present'])(
    'opens %s snapshots and closes the loading dialog',
    async (access) => {
      const document = createEmptyDocument('Shared')
      const pending = deferred<SharedSnapshot>()
      vi.mocked(loadSharedDocument).mockReturnValueOnce(pending.promise)
      const task = openSharedLink(shareSearch)
      expect(useCloudShareStore.getState()).toMatchObject({
        open: true,
        mode: 'load',
        busy: true,
        error: null,
        url: null
      })
      expect(loadSharedDocument).toHaveBeenCalledWith(
        'abcdefghijklmnopqrstu',
        expect.any(AbortSignal)
      )
      pending.resolve({ access, document })
      await task
      expect(useCloudShareStore.getState()).toMatchObject({
        open: false,
        busy: false,
        presentation: access === 'present' ? document : null
      })
    }
  )

  it.each([new CloudShareError('changed'), new Error('offline')])(
    'reports failures and lets the user retry: %s',
    async (error) => {
      vi.mocked(loadSharedDocument).mockRejectedValueOnce(error)
      await openSharedLink(shareSearch)
      expect(useCloudShareStore.getState()).toMatchObject({
        open: true,
        busy: false,
        error: error instanceof CloudShareError ? 'changed' : 'unavailable'
      })
      vi.mocked(loadSharedDocument).mockResolvedValueOnce({
        access: 'edit',
        document: createEmptyDocument()
      })
      await openSharedLink(shareSearch)
      expect(useCloudShareStore.getState()).toMatchObject({ open: false, busy: false, error: null })
    }
  )

  it.each(['resolve', 'reject'] as const)(
    'ignores a late %s after cleanup and restart',
    async (outcome) => {
      window.history.replaceState(null, '', `/${shareSearch}`)
      const first = deferred<SharedSnapshot>()
      const second = deferred<SharedSnapshot>()
      vi.mocked(loadSharedDocument)
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise)
      const oldTask = openSharedLink(shareSearch)
      const oldSignal = vi.mocked(loadSharedDocument).mock.calls[0]![1]
      cancelShareRequest()
      expect(window.location.search).toBe(shareSearch)
      const newTask = openSharedLink(shareSearch)
      expect(oldSignal.aborted).toBe(true)
      if (outcome === 'resolve') {
        first.resolve({ access: 'present', document: createEmptyDocument('Old') })
      } else {
        first.reject(new CloudShareError('missing'))
      }
      await oldTask
      expect(useCloudShareStore.getState()).toMatchObject({
        open: true,
        busy: true,
        error: null,
        presentation: null
      })
      second.resolve({ access: 'edit', document: createEmptyDocument('New') })
      await newTask
      expect(useCloudShareStore.getState()).toMatchObject({
        open: false,
        busy: false,
        presentation: null
      })
    }
  )
})

it.each([new ExampleError('changed'), new Error('offline')])(
  'reports example errors and clears them on retry: %s',
  async (error) => {
    vi.mocked(loadExampleDocument).mockRejectedValueOnce(error)
    await openExampleLink('?example=flowchart')
    expect(useExampleStore.getState()).toMatchObject({
      open: true,
      busy: false,
      error: error instanceof ExampleError ? 'changed' : 'network'
    })
    await openExampleLink('?example=flowchart')
    expect(useExampleStore.getState()).toMatchObject({ open: false, busy: false, error: null })
  }
)

it.each(['resolve', 'reject'] as const)(
  'keeps a newer example request cancellable after a stale %s',
  async (outcome) => {
    const first = deferred<void>()
    const second = deferred<void>()
    vi.mocked(loadExampleDocument)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const oldTask = openExampleLink('?example=flowchart')
    const task = openExampleLink('?example=erd')
    const [oldSignal, signal] = vi.mocked(loadExampleDocument).mock.calls.map((call) => call[1])
    expect(oldSignal!.aborted).toBe(true)
    if (outcome === 'resolve') {
      first.resolve()
    } else {
      first.reject(new ExampleError('network'))
    }
    await oldTask
    expect(useExampleStore.getState()).toMatchObject({ open: true, busy: true, error: null })
    hideExampleDialog()
    expect(signal!.aborted).toBe(true)
    second.resolve()
    await task
    expect(useExampleStore.getState()).toMatchObject({ open: false, busy: false, error: null })
  }
)

it('aborts both loading links when another document replaces them', async () => {
  window.history.replaceState(
    null,
    '',
    '/?lang=en&share=abcdefghijklmnopqrstu&example=flowchart#canvas'
  )
  const share = deferred<SharedSnapshot>()
  const example = deferred<void>()
  vi.mocked(loadSharedDocument).mockReturnValueOnce(share.promise)
  vi.mocked(loadExampleDocument).mockReturnValueOnce(example.promise)
  const shareTask = openSharedLink(shareSearch)
  const exampleTask = openExampleLink('?example=flowchart')
  loadReplacement({ document: createEmptyDocument('Local'), filePath: null }, { camera: 'keep' })
  expect(vi.mocked(loadSharedDocument).mock.calls[0]![1].aborted).toBe(true)
  expect(vi.mocked(loadExampleDocument).mock.calls[0]![1].aborted).toBe(true)
  expect(window.location.search).toBe('?lang=en')
  expect(window.location.hash).toBe('#canvas')
  share.reject(new CloudShareError('changed'))
  example.reject(new ExampleError('changed'))
  await Promise.all([shareTask, exampleTask])
  expect(useCloudShareStore.getState()).toMatchObject({ open: false, busy: false, error: null })
  expect(useExampleStore.getState()).toMatchObject({ open: false, busy: false, error: null })
  expect(useDocumentStore.getState().document.name).toBe('Local')
})

describe('publishing', () => {
  it('captures the current camera and access and prevents duplicate requests', async () => {
    showShareDialog()
    useCloudShareStore.getState().setAccess('edit')
    const camera = { x: 10, y: 20, zoom: 2 }
    useCameraStore.getState().setCamera(camera)
    const result = deferred<string>()
    vi.mocked(createCloudShare).mockReturnValueOnce(result.promise)
    const task = publishShare()
    expect(createCloudShare).toHaveBeenCalledWith(
      { ...useDocumentStore.getState().document, camera },
      expect.any(AbortSignal),
      'edit'
    )
    useCloudShareStore.getState().setAccess('present')
    expect(useCloudShareStore.getState().access).toBe('edit')
    await expect(publishShare()).resolves.toBeNull()
    expect(createCloudShare).toHaveBeenCalledTimes(1)
    result.resolve('https://example.test/?share=id')
    await expect(task).resolves.toBe('https://example.test/?share=id')
    expect(useCloudShareStore.getState()).toMatchObject({
      busy: false,
      url: 'https://example.test/?share=id'
    })
  })

  it.each([new CloudShareError('quota'), new Error('offline')])(
    'reports publication errors: %s',
    async (error) => {
      showShareDialog()
      vi.mocked(createCloudShare).mockRejectedValueOnce(error)
      await expect(publishShare()).resolves.toBeNull()
      expect(useCloudShareStore.getState()).toMatchObject({
        busy: false,
        url: null,
        error: error instanceof CloudShareError ? 'quota' : 'unavailable'
      })
    }
  )

  it.each(['show', 'hide', 'link'] as const)(
    'aborts publication on %s and ignores its late result',
    async (action) => {
      showShareDialog()
      const result = deferred<string>()
      vi.mocked(createCloudShare).mockReturnValueOnce(result.promise)
      const task = publishShare()
      const signal = vi.mocked(createCloudShare).mock.calls[0]![1]
      if (action === 'show') {
        showShareDialog()
      } else if (action === 'hide') {
        hideShareDialog()
      } else {
        vi.mocked(loadSharedDocument).mockResolvedValueOnce({
          access: 'edit',
          document: createEmptyDocument()
        })
        await openSharedLink(shareSearch)
      }
      expect(signal!.aborted).toBe(true)
      const before = useCloudShareStore.getState()
      result.resolve('https://example.test/old')
      await expect(task).resolves.toBeNull()
      expect(useCloudShareStore.getState()).toBe(before)
    }
  )

  it('clears the query only when dismissing a load dialog', async () => {
    window.history.replaceState(null, '', `/${shareSearch}&lang=en#canvas`)
    showShareDialog()
    hideShareDialog()
    expect(window.location.search).toContain('share=')
    await openSharedLink('?share=bad')
    hideShareDialog()
    expect(window.location.search).toBe('?lang=en')
    expect(window.location.hash).toBe('#canvas')
  })
})
