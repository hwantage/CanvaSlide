import { RECOVERY_SNAPSHOT_VERSION } from '@shared/canvas/recovery-snapshot'
import { createEmptyDocument } from '@shared/canvas/element-types'
import { decodeRecoveryFile, encodeRecoverySnapshot } from '@/lib/document-file-codec'
import {
  claimRecoverySession,
  currentSessionId,
  ownsRecoverySession,
  releaseRecoverySession
} from './recovery-session'
import type * as RecoveryDatabase from './recovery-database'
import {
  clearStoredSnapshots,
  listStoredSessions,
  readStoredMetadata,
  readStoredSnapshot,
  RecoveryStorageUnavailableError,
  writeStoredSnapshot
} from './recovery-database'
import {
  clearRecoverySnapshots,
  readRecoveryDocument,
  readRecoverySnapshots,
  RecoveryWriteError,
  snapshotFile,
  snapshotFilePath,
  writeRecoverySnapshot
} from './recovery-storage'

vi.mock('@/lib/document-file-codec', () => ({
  encodeRecoverySnapshot: vi.fn(),
  decodeRecoveryFile: vi.fn()
}))
vi.mock('./recovery-session', () => ({
  currentSessionId: () => 'own',
  ownsRecoverySession: vi.fn(),
  claimRecoverySession: vi.fn(),
  releaseRecoverySession: vi.fn(),
  supportsSessionOwnership: () => true
}))
vi.mock('./recovery-database', async (importOriginal) => {
  const actual = await importOriginal<typeof RecoveryDatabase>()
  return {
    RecoveryStorageUnavailableError: actual.RecoveryStorageUnavailableError,
    listStoredSessions: vi.fn(),
    readStoredSnapshot: vi.fn(),
    readStoredMetadata: vi.fn(),
    writeStoredSnapshot: vi.fn(),
    clearStoredSnapshots: vi.fn()
  }
})
const meta = { file: null, documentName: 'Untitled', savedAt: 1_000 }
const info = { version: RECOVERY_SNAPSHOT_VERSION as 1, ...meta }
const bytes = new TextEncoder().encode(JSON.stringify({ ...info, contents: '{"version":1}' }))
const record = { info, payload: bytes }
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(encodeRecoverySnapshot).mockResolvedValue(bytes)
  vi.mocked(listStoredSessions).mockResolvedValue([])
  vi.mocked(readStoredSnapshot).mockResolvedValue(null)
  vi.mocked(readStoredMetadata).mockResolvedValue(null)
  vi.mocked(writeStoredSnapshot).mockResolvedValue()
  vi.mocked(clearStoredSnapshots).mockResolvedValue()
  vi.mocked(claimRecoverySession).mockResolvedValue(true)
  vi.mocked(ownsRecoverySession).mockReturnValue(true)
})
describe('recovery backend boundaries', () => {
  it('stores transferable worker bytes with their associated metadata', async () => {
    await writeRecoverySnapshot(createEmptyDocument(), meta)
    expect(writeStoredSnapshot).toHaveBeenCalledWith(currentSessionId(), bytes, info)
  })
  it.each([
    ['quota', new DOMException('quota exceeded', 'QuotaExceededError')],
    ['quota', new Error('io error: No space left on device')],
    ['unavailable', new RecoveryStorageUnavailableError('IndexedDB blocked')],
    ['failed', new Error('other failure')]
  ] as const)('reports %s writes rather than swallowing errors', async (reason, thrown) => {
    vi.mocked(writeStoredSnapshot).mockRejectedValue(thrown)
    await expect(writeRecoverySnapshot(createEmptyDocument(), meta)).rejects.toMatchObject({
      reason,
      message: thrown.message
    })
    expect(new RecoveryWriteError(reason, thrown.message)).toBeInstanceOf(Error)
  })
  it('refuses writes, reads and deletes without an acknowledged claim', async () => {
    vi.mocked(ownsRecoverySession).mockReturnValue(false)
    await expect(writeRecoverySnapshot(createEmptyDocument(), meta)).rejects.toThrow('not owned')
    await expect(readRecoveryDocument('foreign')).rejects.toThrow('not owned')
    await expect(clearRecoverySnapshots(['foreign'])).rejects.toThrow('not owned')
    expect(encodeRecoverySnapshot).not.toHaveBeenCalled()
    expect(clearStoredSnapshots).not.toHaveBeenCalled()
  })
  it('preserves and exposes transient restore and cleanup failures', async () => {
    vi.mocked(readStoredSnapshot).mockRejectedValue(new Error('read aborted'))
    await expect(readRecoveryDocument('lost')).rejects.toThrow('read aborted')
    expect(clearStoredSnapshots).not.toHaveBeenCalled()
    vi.mocked(clearStoredSnapshots).mockRejectedValue(new Error('delete aborted'))
    await expect(clearRecoverySnapshots(['lost'])).rejects.toThrow('delete aborted')
  })
  it('decodes the stored payload bytes on the worker', async () => {
    vi.mocked(readStoredSnapshot).mockResolvedValue(record)
    await readRecoveryDocument('lost')
    expect(decodeRecoveryFile).toHaveBeenCalledWith(bytes)
  })
  it('preserves missing records and worker failures as retryable restore failures', async () => {
    await expect(readRecoveryDocument('lost')).rejects.toThrow('missing')
    vi.mocked(readStoredSnapshot).mockResolvedValue(record)
    vi.mocked(decodeRecoveryFile).mockRejectedValue(new Error('worker crashed'))
    await expect(readRecoveryDocument('lost')).rejects.toThrow('worker crashed')
    expect(clearStoredSnapshots).not.toHaveBeenCalled()
  })
})
describe('launch scan', () => {
  const store = (records: Record<string, NonNullable<RecoveryDatabase.StoredMetadata>>) => {
    vi.mocked(listStoredSessions).mockResolvedValue(Object.keys(records))
    vi.mocked(readStoredMetadata).mockImplementation(async (id) => records[id] ?? null)
  }
  it('judges a record from its metadata without loading the payload', async () => {
    store({ lost: { info } })
    const result = await readRecoverySnapshots()
    expect(result.sessions[0]?.snapshot).toEqual(info)
    expect(readStoredSnapshot).not.toHaveBeenCalled()
    expect(decodeRecoveryFile).not.toHaveBeenCalled()
    expect(releaseRecoverySession).not.toHaveBeenCalled()
  })
  it('skips its own and adopted records even on a repeated scan', async () => {
    store({ own: { info }, adopted: { info } })
    expect(await readRecoverySnapshots(['adopted'])).toEqual({
      sessions: [],
      quarantined: [],
      failures: []
    })
    expect(readStoredMetadata).not.toHaveBeenCalled()
  })
  it.each(['malformed', { ...info, version: 2 }])(
    'never reads live incompatible data (%j)',
    async (metadata) => {
      store({ live: { info: metadata } })
      vi.mocked(claimRecoverySession).mockResolvedValue(false)
      await readRecoverySnapshots()
      expect(readStoredMetadata).not.toHaveBeenCalled()
      expect(clearStoredSnapshots).not.toHaveBeenCalled()
    }
  )
  it.each([
    ['malformed', null],
    [{ ...info, version: 2 }, 2]
  ] as const)('quarantines abandoned incompatible data (%j)', async (metadata, version) => {
    store({ lost: { info: metadata } })
    expect((await readRecoverySnapshots()).quarantined).toEqual([{ sessionId: 'lost', version }])
    expect(clearStoredSnapshots).not.toHaveBeenCalled()
    expect(releaseRecoverySession).not.toHaveBeenCalled()
  })
  it('reports an incomplete scan and releases the unreadable record for retry', async () => {
    store({ lost: { info } })
    vi.mocked(readStoredMetadata).mockRejectedValue(new Error('store busy'))
    expect((await readRecoverySnapshots()).failures).toEqual(['store busy'])
    expect(releaseRecoverySession).toHaveBeenCalledWith('lost')
  })
  it('skips and releases a record removed after listing instead of quarantining it', async () => {
    vi.mocked(listStoredSessions).mockResolvedValue(['gone'])
    const result = await readRecoverySnapshots()
    expect(result).toEqual({ sessions: [], quarantined: [], failures: [] })
    expect(releaseRecoverySession).toHaveBeenCalledWith('gone')
  })
  it('does not report a failed list as empty storage', async () => {
    vi.mocked(listStoredSessions).mockRejectedValue(new Error('store gone'))
    await expect(readRecoverySnapshots()).rejects.toThrow('store gone')
  })
})
describe('stored file handles', () => {
  it('round-trips plain paths and native non-Unicode paths', () => {
    expect(snapshotFilePath(snapshotFile('/decks/a.canvaslide'))).toBe('/decks/a.canvaslide')
    const path = { encoding: 'unix-bytes' as const, bytes: [47, 255, 46], display: '/�.' }
    expect(snapshotFilePath(snapshotFile(path))).toEqual(path)
  })
  it.each([
    null,
    undefined,
    42,
    '',
    'a\0b',
    { encoding: 'unix-bytes' },
    { encoding: 'martian', bytes: [] },
    { encoding: 'unix-bytes', display: '/x', bytes: [256] },
    { encoding: 'unix-bytes', display: '/x', bytes: [-1] },
    { encoding: 'unix-bytes', display: '/x', bytes: [1.2] },
    { encoding: 'unix-bytes', display: '/x', bytes: [0] },
    { encoding: 'unix-bytes', display: '/x', bytes: [Number.NaN] },
    { encoding: 'windows-wide', display: '/x', units: [65] }
  ])('falls back to Save As for invalid or foreign-platform handle %j', (handle) => {
    expect(snapshotFilePath({ display: '/x', handle })).toBeNull()
  })
})
