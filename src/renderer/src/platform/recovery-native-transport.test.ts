import { invoke } from '@tauri-apps/api/core'
import { createEmptyDocument } from '@shared/canvas/element-types'
import { encodeRecoverySnapshot } from '@/lib/document-file-codec'
import { t } from '@/i18n/ui-strings'
import { readRecoverySnapshots, writeRecoverySnapshot } from './recovery-storage'
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => {}) }))
vi.mock('./tauri-runtime', () => ({ isTauriRuntime: () => true }))
vi.mock('./recovery-session', () => ({
  currentSessionId: () => 'native-session',
  ownsRecoverySession: () => true,
  claimRecoverySession: vi.fn(async () => true),
  releaseRecoverySession: vi.fn()
}))
vi.mock('@/lib/document-file-codec', () => ({ encodeRecoverySnapshot: vi.fn() }))
it('offers the completed native snapshot while reporting its quarantined temporary data', async () => {
  const snapshot = { version: 1, file: null, documentName: 'Old work', savedAt: 1000 }
  vi.mocked(invoke).mockImplementation(
    async (command) =>
      (command === 'list_recovery_sessions'
        ? ['lost']
        : { ...snapshot, temporaryError: 'temp retained' }) as never
  )
  expect(await readRecoverySnapshots()).toEqual({
    sessions: [{ sessionId: 'lost', snapshot, abandoned: true }],
    quarantined: [],
    failures: ['temp retained']
  })
})
it('uses the binary IPC body instead of nesting the full envelope in JSON arguments', async () => {
  const bytes = new TextEncoder().encode('{"contents":"payload"}')
  vi.mocked(encodeRecoverySnapshot).mockResolvedValue(bytes)
  await writeRecoverySnapshot(createEmptyDocument(), {
    file: null,
    documentName: 'Untitled',
    savedAt: 1000
  })
  expect(invoke).toHaveBeenCalledWith('write_recovery_snapshot', bytes, {
    headers: { 'x-recovery-session': 'native-session' }
  })
})

it('exposes a retained corrupt temp-only record for quarantine instead of a permanent scan failure', async () => {
  vi.mocked(invoke).mockImplementation(
    async (command) =>
      (command === 'list_recovery_sessions'
        ? ['lost']
        : { invalid: true, temporaryError: 'temporary data retained as lost' }) as never
  )
  expect(await readRecoverySnapshots()).toEqual({
    sessions: [],
    quarantined: [{ sessionId: 'lost', version: null }],
    failures: ['temporary data retained as lost']
  })
  vi.mocked(invoke).mockImplementation(
    async (command) =>
      (command === 'list_recovery_sessions' ? ['lost'] : { invalid: true }) as never
  )
  expect(await readRecoverySnapshots()).toEqual({
    sessions: [],
    quarantined: [{ sessionId: 'lost', version: null }],
    failures: []
  })
})

const meta = { file: null, documentName: 'Untitled', savedAt: 1000 }

it.each([
  [
    'quota',
    { code: 'storage_full', detail: 'There is not enough space on the disk. (os error 112)' }
  ],
  ['quota', { code: 'recovery_too_large', detail: '' }],
  ['unavailable', { code: 'recovery_unavailable', detail: 'locked' }],
  ['failed', { code: 'io', detail: 'Input/output error (os error 5)' }]
] as const)('reads a %s write failure from the native error code', async (reason, rejection) => {
  vi.mocked(encodeRecoverySnapshot).mockResolvedValue(new Uint8Array(1))
  vi.mocked(invoke).mockRejectedValue(rejection)
  await expect(writeRecoverySnapshot(createEmptyDocument(), meta)).rejects.toMatchObject({
    reason
  })
})

it('lists a failed native scan by its localized message rather than an object', async () => {
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'list_recovery_sessions') {
      return ['lost'] as never
    }
    throw { code: 'recovery_unavailable', detail: 'locked' }
  })
  expect((await readRecoverySnapshots()).failures).toEqual([
    `${t('nativeError.recoveryUnavailable')}\n\nlocked`
  ])
})
