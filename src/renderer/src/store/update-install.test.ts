import { beforeEach, expect, test, vi } from 'vitest'
import { createEmptyDocument } from '@shared/canvas/element-types'
import { checkForAppUpdate, confirmUpdateChanges, installAppUpdate } from '@/platform/app-update'
import { saveDocumentFile } from '@/platform/document-file-access'
import { saveCurrentDocument } from '@/lib/document/save-document'
import { useDocumentStore } from './document-store'
import { useUpdateStore } from './update-store'

vi.mock('@/platform/app-update', () => ({
  checkForAppUpdate: vi.fn(),
  confirmUpdateChanges: vi.fn(),
  installAppUpdate: vi.fn(),
  openReleasesPage: vi.fn()
}))
vi.mock('@/platform/document-file-access', () => ({
  saveDocumentFile: vi.fn(),
  errorText: (error: unknown) => String(error),
  showErrorMessage: vi.fn()
}))

const found = { version: '9.9.9', notes: null, installable: true }
const doc = () => useDocumentStore.getState()
const install = () => useUpdateStore.getState().install()
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.resetAllMocks()
  doc().loadDocument(createEmptyDocument(), null)
  useUpdateStore.setState({ status: 'available', update: found, error: null, progress: 0 })
  vi.mocked(installAppUpdate).mockImplementation(async (_progress, mayInstall) => mayInstall())
  vi.mocked(confirmUpdateChanges).mockResolvedValue('cancel')
  vi.mocked(saveDocumentFile).mockResolvedValue({ filePath: '/tmp/saved.canvaslide' })
})

test('installs clean work without prompting or saving', async () => {
  await install()
  expect(installAppUpdate).toHaveBeenCalledOnce()
  expect(confirmUpdateChanges).not.toHaveBeenCalled()
  expect(saveDocumentFile).not.toHaveBeenCalled()
})

test.each(['save', 'discard', 'cancel'] as const)(
  'handles the %s choice before installation',
  async (choice) => {
    doc().renameDocument('Unsaved')
    vi.mocked(confirmUpdateChanges).mockResolvedValue(choice)
    await install()
    expect(confirmUpdateChanges).toHaveBeenCalledOnce()
    expect(installAppUpdate).toHaveBeenCalledTimes(choice === 'cancel' ? 0 : 1)
    expect(saveDocumentFile).toHaveBeenCalledTimes(choice === 'save' ? 1 : 0)
    expect(doc().dirty).toBe(choice !== 'save')
    if (choice === 'cancel') {
      expect(useUpdateStore.getState()).toMatchObject({ status: 'available', update: found })
    }
  }
)

test.each(['cancelled', 'failed'] as const)('does not install after a %s save', async (outcome) => {
  doc().renameDocument('Unsaved')
  vi.mocked(confirmUpdateChanges).mockResolvedValue('save')
  if (outcome === 'cancelled') {
    vi.mocked(saveDocumentFile).mockResolvedValue(null)
  } else {
    vi.mocked(saveDocumentFile).mockRejectedValue(new Error('disk full'))
  }
  await install()
  expect(installAppUpdate).not.toHaveBeenCalled()
  expect(doc().dirty).toBe(true)
  expect(useUpdateStore.getState().status).toBe(outcome === 'cancelled' ? 'available' : 'error')
})

test('waits for a successful save before installing', async () => {
  doc().renameDocument('Unsaved')
  vi.mocked(confirmUpdateChanges).mockResolvedValue('save')
  const saving = deferred<{ filePath: string }>()
  vi.mocked(saveDocumentFile).mockReturnValue(saving.promise)
  const task = install()
  await vi.waitFor(() => expect(saveDocumentFile).toHaveBeenCalledOnce())
  expect(installAppUpdate).not.toHaveBeenCalled()
  saving.resolve({ filePath: '/tmp/saved.canvaslide' })
  await task
  expect(installAppUpdate).toHaveBeenCalledOnce()
  expect(doc().dirty).toBe(false)
})

test.each(['edit', 'edit and undo', 'replace', 'gesture'] as const)(
  'cancels after %s while asking',
  async (change) => {
    doc().renameDocument('Unsaved')
    const asking = deferred<'discard'>()
    vi.mocked(confirmUpdateChanges).mockReturnValue(asking.promise)
    const task = install()
    if (change === 'replace') {
      doc().loadDocument(createEmptyDocument(), null)
    } else if (change === 'gesture') {
      doc().beginEdit()
    } else {
      doc().renameDocument('Later')
      if (change === 'edit and undo') {
        doc().undo()
      }
    }
    asking.resolve('discard')
    await task
    expect(installAppUpdate).not.toHaveBeenCalled()
    expect(useUpdateStore.getState().status).toBe('available')
  }
)

test('cancels after edits made while saving', async () => {
  doc().renameDocument('Unsaved')
  vi.mocked(confirmUpdateChanges).mockResolvedValue('save')
  vi.mocked(saveDocumentFile).mockImplementation(async () => {
    doc().renameDocument('Newer work')
    return { filePath: '/tmp/saved.canvaslide' }
  })
  await install()
  expect(installAppUpdate).not.toHaveBeenCalled()
  expect(doc().dirty).toBe(true)
})

test('blocks duplicate installs and checks while asking, then allows retry', async () => {
  doc().renameDocument('Unsaved')
  const asking = deferred<'cancel'>()
  vi.mocked(confirmUpdateChanges).mockReturnValueOnce(asking.promise)
  const task = install()
  await install()
  await useUpdateStore.getState().check()
  expect(confirmUpdateChanges).toHaveBeenCalledOnce()
  expect(checkForAppUpdate).not.toHaveBeenCalled()
  asking.resolve('cancel')
  await task
  vi.mocked(confirmUpdateChanges).mockResolvedValue('discard')
  await install()
  expect(installAppUpdate).toHaveBeenCalledOnce()
})

test('invalidates installation after editing during download', async () => {
  vi.mocked(installAppUpdate).mockImplementation(async (progress, mayInstall) => {
    progress(0.5)
    expect(mayInstall()).toBe(true)
    await install()
    await useUpdateStore.getState().check()
    expect(checkForAppUpdate).not.toHaveBeenCalled()
    doc().renameDocument('New work during download')
    expect(mayInstall()).toBe(false)
    return false
  })
  await install()
  expect(installAppUpdate).toHaveBeenCalledOnce()
  expect(useUpdateStore.getState()).toMatchObject({ status: 'available', progress: 0 })
})

test('serializes update saving behind an existing save', async () => {
  doc().renameDocument('Unsaved')
  const first = deferred<{ filePath: string }>()
  vi.mocked(saveDocumentFile).mockReturnValueOnce(first.promise)
  const previous = saveCurrentDocument()
  await vi.waitFor(() => expect(saveDocumentFile).toHaveBeenCalledOnce())
  vi.mocked(confirmUpdateChanges).mockResolvedValue('save')
  const task = install()
  await Promise.resolve()
  expect(saveDocumentFile).toHaveBeenCalledOnce()
  expect(installAppUpdate).not.toHaveBeenCalled()
  first.resolve({ filePath: '/tmp/first.canvaslide' })
  await previous
  await task
  expect(saveDocumentFile).toHaveBeenCalledTimes(2)
  expect(installAppUpdate).toHaveBeenCalledOnce()
})

test.each(['unavailable', 'not installable', 'gesture'] as const)(
  'refuses installation when %s',
  async (state) => {
    if (state === 'unavailable') {
      useUpdateStore.setState({ update: null })
    } else if (state === 'not installable') {
      useUpdateStore.setState({ update: { ...found, installable: false } })
    } else {
      doc().beginEdit()
    }
    await install()
    expect(installAppUpdate).not.toHaveBeenCalled()
    expect(confirmUpdateChanges).not.toHaveBeenCalled()
  }
)
