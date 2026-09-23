import { invoke } from '@tauri-apps/api/core'
import { createEmptyDocument } from '@shared/canvas/element-types'
import { encodeRecoverySnapshot } from '@/lib/document-file-codec'
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
