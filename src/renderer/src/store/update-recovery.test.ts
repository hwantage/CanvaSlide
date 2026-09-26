import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type * as DocumentFileAccess from '@/platform/document-file-access'
import { createEmptyDocument } from '@shared/canvas/element-types'
import { useDocumentStore } from './document-store'
import { useUpdateStore } from './update-store'

const { check, message, saveDocumentFile, prepareExit, cancelExit, relaunch } = vi.hoisted(() => ({
  check: vi.fn(),
  message: vi.fn(),
  saveDocumentFile: vi.fn(),
  prepareExit: vi.fn(),
  cancelExit: vi.fn(),
  relaunch: vi.fn()
}))
vi.mock('@/platform/tauri-runtime', () => ({ isTauriRuntime: () => true }))
vi.mock('@tauri-apps/plugin-updater', () => ({ check }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ message }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch }))
vi.mock('./recovery-store', () => ({
  useRecoveryStore: { getState: () => ({ prepareExit, cancelExit }) }
}))
vi.mock('@/platform/document-file-access', async (original) => ({
  ...(await original<typeof DocumentFileAccess>()),
  saveDocumentFile
}))

const download = vi.fn()
const nativeInstall = vi.fn()
const doc = () => useDocumentStore.getState()
const install = () => useUpdateStore.getState().install()
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(async () => {
  vi.resetAllMocks()
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Windows NT 10.0')
  doc().loadDocument(createEmptyDocument(), null)
  useUpdateStore.setState({ status: 'idle', update: null, progress: 0, error: null })
  check.mockResolvedValue({
    version: '99.0.0',
    rawJson: {},
    download,
    install: nativeInstall,
    close: vi.fn()
  })
  prepareExit.mockResolvedValue(undefined)
  saveDocumentFile.mockResolvedValue({ filePath: '/tmp/saved.canvaslide' })
  message.mockResolvedValue('Discard changes')
  await useUpdateStore.getState().check()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

test.each(['Discard changes', 'Save'])(
  'awaits recovery cleanup after %s before native install',
  async (choice) => {
    const events: string[] = []
    const cleanup = deferred()
    doc().renameDocument('Unsaved')
    message.mockResolvedValue(choice)
    saveDocumentFile.mockImplementation(async () => {
      events.push('save')
      return { filePath: '/tmp/saved.canvaslide' }
    })
    download.mockImplementation(async () => {
      events.push('download')
    })
    prepareExit.mockImplementation(() => {
      events.push('prepare')
      return cleanup.promise
    })
    nativeInstall.mockImplementation(async () => {
      events.push('install')
    })
    const task = install()
    await vi.waitFor(() => expect(prepareExit).toHaveBeenCalledOnce())
    expect(nativeInstall).not.toHaveBeenCalled()
    cleanup.resolve()
    await task
    expect(events).toEqual(
      choice === 'Save'
        ? ['save', 'download', 'prepare', 'install']
        : ['download', 'prepare', 'install']
    )
    expect(cancelExit).not.toHaveBeenCalled()
    expect(relaunch).toHaveBeenCalledOnce()
  }
)

test.each(['edit', 'edit and undo', 'replace'])(
  'cancels recovery exit and installation after %s during stalled cleanup',
  async (change) => {
    vi.useFakeTimers()
    prepareExit.mockReturnValue(new Promise(() => {}))
    const task = install()
    await vi.waitFor(() => expect(prepareExit).toHaveBeenCalledOnce())
    if (change === 'replace') {
      doc().loadDocument(createEmptyDocument('Replacement'), null)
    } else {
      doc().renameDocument('New work')
      if (change === 'edit and undo') {
        doc().undo()
      }
    }
    await task
    expect(nativeInstall).not.toHaveBeenCalled()
    expect(relaunch).not.toHaveBeenCalled()
    expect(cancelExit).toHaveBeenCalledOnce()
    expect(useUpdateStore.getState().status).toBe('available')
    expect(vi.getTimerCount()).toBe(0)
  }
)

test('cancels recovery exit when a gesture is active as cleanup completes', async () => {
  const cleanup = deferred()
  prepareExit.mockReturnValue(cleanup.promise)
  const task = install()
  await vi.waitFor(() => expect(prepareExit).toHaveBeenCalledOnce())
  doc().beginEdit()
  cleanup.resolve()
  await task
  expect(nativeInstall).not.toHaveBeenCalled()
  expect(cancelExit).toHaveBeenCalledOnce()
})

test.each(['install', 'relaunch'])('resumes recovery after %s fails', async (phase) => {
  if (phase === 'install') {
    nativeInstall.mockRejectedValue(new Error('install failed'))
  } else {
    relaunch.mockRejectedValue(new Error('restart failed'))
  }
  await install()
  expect(prepareExit).toHaveBeenCalledOnce()
  expect(cancelExit).toHaveBeenCalledOnce()
  expect(useUpdateStore.getState().status).toBe('error')
})

test('uses the same two-second cleanup deadline as quitting', async () => {
  vi.useFakeTimers()
  prepareExit.mockReturnValue(new Promise(() => {}))
  const task = install()
  await vi.advanceTimersByTimeAsync(0)
  expect(prepareExit).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(1999)
  expect(nativeInstall).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  await task
  expect(nativeInstall).toHaveBeenCalledOnce()
  expect(cancelExit).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

test('allows installation after failed cleanup like the native quit path', async () => {
  prepareExit.mockRejectedValue(new Error('cleanup failed'))
  await install()
  expect(prepareExit).toHaveBeenCalledOnce()
  expect(nativeInstall).toHaveBeenCalledOnce()
  expect(cancelExit).not.toHaveBeenCalled()
})

test('does not stop recovery when the final pre-cleanup guard refuses installation', async () => {
  download.mockImplementation(async () => {
    doc().renameDocument('New download work')
  })
  await install()
  expect(prepareExit).not.toHaveBeenCalled()
  expect(cancelExit).not.toHaveBeenCalled()
  expect(nativeInstall).not.toHaveBeenCalled()
})
