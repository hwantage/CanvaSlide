import { createEmptyDocument, defaultTextStyle } from '@shared/canvas/element-types'
import { insertElement } from '@shared/canvas/document-mutations'
import type * as Storage from '@/platform/recovery-storage'
import {
  canOwnSessions,
  clearOwnRecoverySnapshot,
  clearRecoverySnapshots,
  readRecoveryDocument,
  readRecoverySnapshots,
  recoveryLocation,
  RecoveryWriteError,
  writeRecoverySnapshot
} from '@/platform/recovery-storage'
import { claimSession, releaseRecoverySession } from '@/platform/recovery-session'
import { confirmDiscardChanges } from '@/platform/document-file-access'
import { useCameraStore } from './camera-store'
import { useDocumentStore } from './document-store'
import { usePresentationStore } from './presentation-store'
import { createRecoveryStore } from './recovery-store'

vi.mock('@/platform/document-file-access', () => ({ confirmDiscardChanges: vi.fn() }))
vi.mock('@/platform/recovery-session', () => ({
  claimSession: vi.fn(),
  releaseRecoverySession: vi.fn()
}))
vi.mock('@/platform/recovery-storage', async (original) => {
  const actual = await original<typeof Storage>()
  return {
    ...actual,
    canOwnSessions: vi.fn(),
    clearOwnRecoverySnapshot: vi.fn(),
    clearRecoverySnapshots: vi.fn(),
    readRecoveryDocument: vi.fn(),
    readRecoverySnapshots: vi.fn(),
    recoveryLocation: vi.fn(),
    writeRecoverySnapshot: vi.fn()
  }
})
const info = (name: string, savedAt = 1000) => ({
  version: 1 as const,
  file: { display: `/decks/${name}.canvaslide`, handle: `/decks/${name}.canvaslide` },
  documentName: name,
  savedAt
})
const record = (name: string, savedAt = 1000) => ({
  sessionId: name,
  snapshot: info(name, savedAt),
  abandoned: true
})
const found = (...names: string[]) => ({
  sessions: names.map((name, i) => record(name, i + 1)),
  quarantined: [],
  failures: []
})
const decoded = (name: string) => ({
  kind: 'decoded-recovery' as const,
  result: { ok: true as const, document: createEmptyDocument(name) },
  snapshot: info(name)
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
let store: ReturnType<typeof createRecoveryStore>
beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  store = createRecoveryStore()
  useDocumentStore.getState().loadDocument(createEmptyDocument(), null)
  vi.mocked(canOwnSessions).mockReturnValue(true)
  vi.mocked(claimSession).mockResolvedValue(true)
  vi.mocked(releaseRecoverySession).mockResolvedValue()
  vi.mocked(readRecoverySnapshots).mockResolvedValue(found())
  vi.mocked(readRecoveryDocument).mockImplementation(async (id) => decoded(id))
  vi.mocked(recoveryLocation).mockResolvedValue({ kind: 'browser' })
  vi.mocked(writeRecoverySnapshot).mockResolvedValue()
  vi.mocked(clearOwnRecoverySnapshot).mockResolvedValue()
  vi.mocked(clearRecoverySnapshots).mockResolvedValue()
  vi.mocked(confirmDiscardChanges).mockResolvedValue(true)
})
async function launch(...names: string[]) {
  vi.mocked(readRecoverySnapshots).mockResolvedValue(found(...names))
  await store.getState().initialize()
}
const save = () =>
  store.getState().save(useDocumentStore.getState().document, {
    file: null,
    documentName: 'current',
    savedAt: 5000
  })

describe('launch ownership, retention and failures', () => {
  it('queues every lost session newest first without deleting the sixth or older copies', async () => {
    await launch('a', 'b', 'c', 'd', 'e', 'f', 'g')
    expect(store.getState().offers.map((s) => s.sessionId)).toEqual([
      'g',
      'f',
      'e',
      'd',
      'c',
      'b',
      'a'
    ])
    expect(store.getState().batchRemaining).toBe(5)
    expect(clearRecoverySnapshots).not.toHaveBeenCalled()
  })
  it('leaves a live session out of offers and deletions', async () => {
    vi.mocked(readRecoverySnapshots).mockResolvedValue({
      ...found(),
      sessions: [{ ...record('live'), abandoned: false }]
    })
    await store.getState().initialize()
    expect(store.getState().offers).toEqual([])
    expect(clearRecoverySnapshots).not.toHaveBeenCalled()
  })
  it('reports unknown versions as retained quarantined offers', async () => {
    vi.mocked(readRecoverySnapshots).mockResolvedValue({
      ...found(),
      quarantined: [{ sessionId: 'future', version: 99 }]
    })
    await store.getState().initialize()
    expect(store.getState().offers).toEqual([
      { sessionId: 'future', version: 99, quarantined: true }
    ])
    await store.getState().restoreOffer()
    expect(readRecoveryDocument).not.toHaveBeenCalled()
    expect(clearRecoverySnapshots).not.toHaveBeenCalled()
  })
  it('defers payload decoding until Restore', async () => {
    await launch('a', 'b')
    expect(readRecoveryDocument).not.toHaveBeenCalled()
  })
  it('reports unsupported ownership and refuses writes', async () => {
    vi.mocked(canOwnSessions).mockReturnValue(false)
    await store.getState().initialize()
    await save()
    expect(store.getState()).toMatchObject({ status: 'unsupported', ready: false })
    expect(readRecoverySnapshots).not.toHaveBeenCalled()
    expect(writeRecoverySnapshot).not.toHaveBeenCalled()
  })
  it('requires acknowledged acquisition, not just API presence', async () => {
    vi.mocked(claimSession).mockRejectedValue(new Error('SecurityError'))
    await store.getState().initialize()
    await save()
    expect(store.getState()).toMatchObject({
      ready: false,
      status: 'failed',
      scanError: 'SecurityError'
    })
    expect(writeRecoverySnapshot).not.toHaveBeenCalled()
  })
  it('shares an in-flight scan and supports an explicit retry after failure', async () => {
    const pending = deferred<Storage.StoredRecovery>()
    vi.mocked(readRecoverySnapshots).mockReturnValueOnce(pending.promise)
    const first = store.getState().initialize()
    const second = store.getState().initialize()
    expect(first).toBe(second)
    pending.resolve(found('a'))
    await first
    expect(readRecoverySnapshots).toHaveBeenCalledTimes(1)
    vi.mocked(readRecoverySnapshots).mockRejectedValueOnce(new Error('offline'))
    await store.getState().initialize()
    expect(store.getState().scanError).toBe('offline')
    await launch('a', 'b')
    expect(store.getState().scanError).toBeNull()
    expect(store.getState().offers).toHaveLength(2)
  })
  it('reports partial reads while still offering readable work', async () => {
    vi.mocked(readRecoverySnapshots).mockResolvedValue({ ...found('a'), failures: ['read failed'] })
    await store.getState().initialize()
    expect(store.getState()).toMatchObject({ scanError: 'read failed', ready: true })
    expect(store.getState().offers).toHaveLength(1)
  })
  it('does not call cleanup before launch has read storage', async () => {
    const pending = deferred<Storage.StoredRecovery>()
    vi.mocked(readRecoverySnapshots).mockReturnValue(pending.promise)
    const boot = store.getState().initialize()
    store.getState().setEnabled(false)
    await Promise.resolve()
    expect(clearOwnRecoverySnapshot).not.toHaveBeenCalled()
    pending.resolve(found())
    await boot
    await store.getState().clear()
    expect(clearOwnRecoverySnapshot).toHaveBeenCalled()
  })
  it('shows native directory errors without substituting a browser location', async () => {
    vi.mocked(recoveryLocation).mockRejectedValue(new Error('permission denied'))
    await store.getState().initialize()
    expect(store.getState()).toMatchObject({ location: null, scanError: 'permission denied' })
  })
})
describe('answering offers', () => {
  beforeEach(async () => {
    await launch('a', 'b')
  })
  it('retains a transiently unreadable record and successfully retries it', async () => {
    vi.mocked(readRecoveryDocument).mockRejectedValueOnce(new Error('read aborted'))
    await store.getState().restoreOffer()
    expect(store.getState().offers).toHaveLength(2)
    expect(clearRecoverySnapshots).not.toHaveBeenCalled()
    expect(store.getState().error).toBe('read aborted')
    await store.getState().restoreOffer()
    expect(useDocumentStore.getState().document.name).toBe('b')
  })
  it('quarantines a malformed document instead of deleting or loading it', async () => {
    vi.mocked(readRecoveryDocument).mockResolvedValue({
      kind: 'decoded-recovery',
      result: { ok: false, error: 'invalid' },
      snapshot: null
    })
    await store.getState().restoreOffer()
    expect(store.getState().offers[0]).toMatchObject({ sessionId: 'b', quarantined: true })
    expect(useDocumentStore.getState().document.name).toBe('Untitled')
    expect(clearRecoverySnapshots).not.toHaveBeenCalled()
  })
  it('restores atomically as dirty with an authoritative file path and retains the source', async () => {
    await store.getState().restoreOffer()
    expect(useDocumentStore.getState()).toMatchObject({
      dirty: true,
      savedDocument: null,
      filePath: '/decks/b.canvaslide'
    })
    expect(store.getState()).toMatchObject({ adopted: 'b', prompting: false })
    expect(store.getState().offers.map((s) => s.sessionId)).toEqual(['a'])
    expect(clearRecoverySnapshots).not.toHaveBeenCalled()
  })
  it("ends a frame preview, drops a share link and returns to the copy's camera", async () => {
    const camera = { x: 120, y: -40, zoom: 2 }
    vi.mocked(readRecoveryDocument).mockResolvedValue({
      ...decoded('b'),
      result: { ok: true, document: { ...createEmptyDocument('b'), camera } }
    })
    window.history.replaceState(null, '', '/?lang=en&share=abc')
    usePresentationStore.setState({
      active: true,
      previewFrameId: 'frame',
      cameraBeforeStart: null
    })
    await store.getState().restoreOffer()
    expect(useDocumentStore.getState().document.name).toBe('b')
    expect(usePresentationStore.getState().active).toBe(false)
    expect(window.location.search).toBe('?lang=en')
    expect(useCameraStore.getState().camera).toEqual(camera)
  })
  it('keeps restored work dirty after an edit is undone', async () => {
    await store.getState().restoreOffer()
    useDocumentStore.getState().renameDocument('changed')
    useDocumentStore.getState().undo()
    expect(useDocumentStore.getState().dirty).toBe(true)
    expect(useDocumentStore.getState().document.name).toBe('b')
  })
  it('retains the adopted copy until its exact replacement write succeeds', async () => {
    await store.getState().restoreOffer()
    const pending = deferred<void>()
    vi.mocked(writeRecoverySnapshot).mockReturnValueOnce(pending.promise)
    const writing = save()
    await Promise.resolve()
    expect(clearRecoverySnapshots).not.toHaveBeenCalled()
    pending.resolve()
    await writing
    expect(clearRecoverySnapshots).toHaveBeenCalledWith(['b'])
    expect(store.getState().adopted).toBeNull()
  })
  it('never deletes the adopted record when the write fails', async () => {
    await store.getState().restoreOffer()
    vi.mocked(writeRecoverySnapshot).mockRejectedValue(new RecoveryWriteError('quota', 'full'))
    await save()
    expect(store.getState()).toMatchObject({ status: 'quota', adopted: 'b' })
    expect(clearRecoverySnapshots).not.toHaveBeenCalled()
  })
  it('does not let an old in-flight write retire a newly restored document', async () => {
    const pending = deferred<void>()
    vi.mocked(writeRecoverySnapshot).mockReturnValueOnce(pending.promise)
    const writing = save()
    await Promise.resolve()
    await store.getState().restoreOffer()
    pending.resolve()
    await writing
    expect(store.getState().adopted).toBe('b')
    expect(clearRecoverySnapshots).not.toHaveBeenCalled()
  })
  it('rejects a queued stale write after the open document changes', async () => {
    const pending = deferred<void>()
    vi.mocked(writeRecoverySnapshot).mockReturnValueOnce(pending.promise)
    const first = save()
    await Promise.resolve()
    const stale = save()
    useDocumentStore.getState().loadDocument(createEmptyDocument(), null)
    pending.resolve()
    await Promise.all([first, stale])
    expect(writeRecoverySnapshot).toHaveBeenCalledTimes(1)
  })
  it('serializes duplicate Restore/Discard actions while decoding', async () => {
    const pending = deferred<Awaited<ReturnType<typeof readRecoveryDocument>>>()
    vi.mocked(readRecoveryDocument).mockReturnValue(pending.promise)
    const restore = store.getState().restoreOffer()
    await store.getState().discardOffer()
    await store.getState().restoreOffer()
    expect(readRecoveryDocument).toHaveBeenCalledTimes(1)
    expect(clearRecoverySnapshots).not.toHaveBeenCalled()
    pending.resolve(decoded('b'))
    await restore
    expect(useDocumentStore.getState().document.name).toBe('b')
  })
  it('does not overwrite a document changed during asynchronous Restore', async () => {
    const pending = deferred<Awaited<ReturnType<typeof readRecoveryDocument>>>()
    vi.mocked(readRecoveryDocument).mockReturnValue(pending.promise)
    const restore = store.getState().restoreOffer()
    useDocumentStore.getState().renameDocument('new work')
    pending.resolve(decoded('b'))
    await restore
    expect(useDocumentStore.getState().document.name).toBe('new work')
    expect(store.getState().offers).toHaveLength(2)
    expect(store.getState().prompting).toBe(false)
  })
  it('does not read a copy after the document changed during the discard confirmation', async () => {
    useDocumentStore.getState().renameDocument('Unsaved')
    const answer = deferred<boolean>()
    vi.mocked(confirmDiscardChanges).mockReturnValue(answer.promise)
    const restore = store.getState().restoreOffer()
    useDocumentStore.getState().renameDocument('Still mine')
    answer.resolve(true)
    await restore
    expect(readRecoveryDocument).not.toHaveBeenCalled()
    expect(useDocumentStore.getState().document.name).toBe('Still mine')
    expect(store.getState().prompting).toBe(false)
  })
  it('keeps the adopted copy when the next copy turns out to be malformed', async () => {
    await store.getState().restoreOffer()
    store.getState().reviewOffers()
    vi.mocked(readRecoveryDocument).mockResolvedValue({
      kind: 'decoded-recovery',
      result: { ok: false, error: 'invalid' },
      snapshot: null
    })
    await store.getState().restoreOffer()
    expect(store.getState().offers[0]).toMatchObject({ sessionId: 'a', quarantined: true })
    expect(store.getState().adopted).toBe('b')
    expect(clearRecoverySnapshots).not.toHaveBeenCalled()
  })
  it('is not canceled by a text remeasurement during asynchronous Restore', async () => {
    const text = {
      id: 'text',
      type: 'text' as const,
      text: 'Hello',
      x: 0,
      y: 0,
      width: 200,
      height: 28,
      textStyle: defaultTextStyle
    }
    useDocumentStore.getState().loadDocument(insertElement(createEmptyDocument(), text), null)
    const pending = deferred<Awaited<ReturnType<typeof readRecoveryDocument>>>()
    vi.mocked(readRecoveryDocument).mockReturnValue(pending.promise)
    const restore = store.getState().restoreOffer()
    useDocumentStore.getState().syncTextHeight('text', 56)
    pending.resolve(decoded('b'))
    await restore
    expect(useDocumentStore.getState().document.name).toBe('b')
    expect(store.getState().adopted).toBe('b')
  })
  it('returns to the editor when replacing unsaved work is refused', async () => {
    await store.getState().restoreOffer()
    store.getState().reviewOffers()
    vi.mocked(confirmDiscardChanges).mockResolvedValue(false)
    await store.getState().restoreOffer()
    expect(confirmDiscardChanges).toHaveBeenCalled()
    expect(store.getState().prompting).toBe(false)
    expect(useDocumentStore.getState().document.name).toBe('b')
    expect(store.getState().offers[0]?.sessionId).toBe('a')
  })
  it('Later preserves the queue and Review opens it again', () => {
    store.getState().deferOffers()
    expect(store.getState().prompting).toBe(false)
    expect(store.getState().offers).toHaveLength(2)
    store.getState().reviewOffers()
    expect(store.getState().prompting).toBe(true)
    expect(clearRecoverySnapshots).not.toHaveBeenCalled()
  })
  it('deletes only a confirmed offer, then releases its claim', async () => {
    await store.getState().discardOffer()
    expect(clearRecoverySnapshots).toHaveBeenCalledWith(['b'])
    expect(releaseRecoverySession).toHaveBeenCalledWith('b')
    expect(store.getState()).toMatchObject({ prompting: true })
    expect(store.getState().offers[0]?.sessionId).toBe('a')
    await store.getState().discardOffer()
    store.getState().reviewOffers()
    expect(store.getState().prompting).toBe(false)
  })
  it('retains the offer and claim if explicit deletion fails', async () => {
    vi.mocked(clearRecoverySnapshots).mockRejectedValueOnce(new Error('busy'))
    await store.getState().discardOffer()
    expect(store.getState().offers).toHaveLength(2)
    expect(releaseRecoverySession).not.toHaveBeenCalled()
    await store.getState().discardOffer()
    expect(store.getState().offers).toHaveLength(1)
  })
  it('stops at five answers without deleting the rest', async () => {
    await launch('a', 'b', 'c', 'd', 'e', 'f')
    for (let i = 0; i < 5; i++) {
      await store.getState().discardOffer()
    }
    expect(store.getState()).toMatchObject({ prompting: false, batchRemaining: 0 })
    expect(store.getState().offers.map((s) => s.sessionId)).toEqual(['a'])
  })
})
describe('writes, cleanup and shutdown', () => {
  beforeEach(async () => {
    await launch()
  })
  it('records a successful write and classifies quota/unexpected errors', async () => {
    await save()
    expect(store.getState()).toMatchObject({ stored: true, status: 'saved', savedAt: 5000 })
    vi.mocked(writeRecoverySnapshot).mockRejectedValueOnce(new RecoveryWriteError('quota', 'full'))
    await save()
    expect(store.getState().status).toBe('quota')
    vi.mocked(writeRecoverySnapshot).mockRejectedValueOnce(new Error('failed'))
    await save()
    expect(store.getState().status).toBe('failed')
  })
  it('clears only the current session and preserves state on failure', async () => {
    await save()
    vi.mocked(clearOwnRecoverySnapshot).mockRejectedValueOnce(new Error('read only'))
    await expect(store.getState().clear()).rejects.toThrow('read only')
    expect(store.getState().stored).toBe(true)
    await store.getState().clear()
    expect(clearRecoverySnapshots).not.toHaveBeenCalled()
    expect(store.getState()).toMatchObject({ stored: false, status: 'idle' })
  })
  it('removes an adopted-only copy on explicit save/cleanup', async () => {
    await launch('a')
    await store.getState().restoreOffer()
    expect(store.getState().stored).toBe(false)
    await store.getState().clear()
    expect(clearRecoverySnapshots).toHaveBeenCalledWith(['a'])
    expect(store.getState().adopted).toBeNull()
  })
  it('turns off and remembers the choice, then turns on', async () => {
    await save()
    store.getState().setEnabled(false)
    await store.getState().clear()
    expect(store.getState()).toMatchObject({ enabled: false, status: 'off', stored: false })
    expect(localStorage.getItem('canvaslide.recovery')).toBe('off')
    store.getState().setEnabled(true)
    expect(store.getState()).toMatchObject({ enabled: true, status: 'idle' })
    expect(localStorage.getItem('canvaslide.recovery')).toBe('on')
  })
  it('drains an in-flight write before quit cleanup and refuses subsequent writes', async () => {
    const pending = deferred<void>()
    vi.mocked(writeRecoverySnapshot).mockReturnValueOnce(pending.promise)
    const writing = save()
    await Promise.resolve()
    const quitting = store.getState().prepareExit()
    expect(clearOwnRecoverySnapshot).not.toHaveBeenCalled()
    pending.resolve()
    await Promise.all([writing, quitting])
    await save()
    expect(writeRecoverySnapshot).toHaveBeenCalledTimes(1)
    expect(clearOwnRecoverySnapshot).toHaveBeenCalledTimes(1)
    expect(store.getState().stored).toBe(false)
  })
  it('cancels queued exit cleanup and permits protection to resume', async () => {
    const pending = deferred<void>()
    vi.mocked(writeRecoverySnapshot).mockReturnValueOnce(pending.promise)
    const writing = save()
    await Promise.resolve()
    const quitting = store.getState().prepareExit()
    useDocumentStore.getState().renameDocument('New edit')
    store.getState().cancelExit()
    pending.resolve()
    await Promise.all([writing, quitting])
    expect(clearOwnRecoverySnapshot).not.toHaveBeenCalled()
    await save()
    expect(writeRecoverySnapshot).toHaveBeenCalledTimes(2)
    expect(store.getState()).toMatchObject({ closing: false, stored: true })
  })
  it('retains an adopted source when quit is canceled during own-copy deletion', async () => {
    await launch('a')
    await store.getState().restoreOffer()
    const pending = deferred<void>()
    vi.mocked(clearOwnRecoverySnapshot).mockReturnValueOnce(pending.promise)
    const quitting = store.getState().prepareExit()
    await Promise.resolve()
    expect(clearOwnRecoverySnapshot).toHaveBeenCalledTimes(1)
    useDocumentStore.getState().renameDocument('Keep recovered work')
    store.getState().cancelExit()
    pending.resolve()
    await quitting
    expect(clearRecoverySnapshots).not.toHaveBeenCalled()
    expect(store.getState().adopted).toBe('a')
    await save()
    expect(clearRecoverySnapshots).toHaveBeenCalledWith(['a'])
    expect(store.getState()).toMatchObject({ stored: true, adopted: null })
  })
})

describe('retry scan lifecycle', () => {
  it('clears a startup failure after storage recovers, without leaving a stale warning', async () => {
    vi.mocked(readRecoverySnapshots).mockRejectedValueOnce(new Error('busy'))
    await store.getState().initialize()
    expect(store.getState().status).toBe('failed')
    await store.getState().initialize()
    expect(store.getState()).toMatchObject({
      ready: true,
      status: 'idle',
      error: null,
      scanError: null
    })
  })
  it('excludes an adopted source from scans and prevents prompt answers during a retry', async () => {
    await launch('a', 'b')
    await store.getState().restoreOffer()
    const pending = deferred<Storage.StoredRecovery>()
    vi.mocked(readRecoverySnapshots).mockReturnValueOnce(pending.promise)
    const scan = store.getState().initialize()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    store.getState().reviewOffers()
    await store.getState().restoreOffer()
    await store.getState().discardOffer()
    expect(readRecoveryDocument).toHaveBeenCalledTimes(1)
    expect(clearRecoverySnapshots).not.toHaveBeenCalled()
    pending.resolve(found('a'))
    await scan
    expect(readRecoverySnapshots).toHaveBeenLastCalledWith(['b'])
  })
})
