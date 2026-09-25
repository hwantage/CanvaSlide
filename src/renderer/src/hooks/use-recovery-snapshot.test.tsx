import { StrictMode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { createEmptyDocument } from '@shared/canvas/element-types'
import { useRecoverySnapshot } from './use-recovery-snapshot'
import { useDocumentStore } from '@/store/document-store'
import { useRecoveryStore } from '@/store/recovery-store'
import {
  canOwnSessions,
  clearOwnRecoverySnapshot,
  clearRecoverySnapshots,
  readRecoverySnapshots,
  writeRecoverySnapshot
} from '@/platform/recovery-storage'
import type * as Storage from '@/platform/recovery-storage'

vi.mock('@/platform/recovery-session', () => ({
  claimSession: vi.fn(async () => true),
  releaseRecoverySession: vi.fn(async () => {})
}))
vi.mock('@/platform/recovery-storage', async (original) => {
  const actual = await original<typeof Storage>()
  return {
    ...actual,
    canOwnSessions: vi.fn(),
    recoveryLocation: vi.fn(async () => ({ kind: 'browser' })),
    readRecoverySnapshots: vi.fn(),
    writeRecoverySnapshot: vi.fn(),
    clearOwnRecoverySnapshot: vi.fn(),
    clearRecoverySnapshots: vi.fn()
  }
})
const empty = { sessions: [], quarantined: [], failures: [] }
const edit = (name = 'edited') => act(() => useDocumentStore.getState().renameDocument(name))
const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'performance'] })
  vi.setSystemTime(100_000)
  vi.clearAllMocks()
  useDocumentStore.getState().loadDocument(createEmptyDocument(), null)
  useRecoveryStore.setState(useRecoveryStore.getInitialState())
  vi.mocked(canOwnSessions).mockReturnValue(true)
  vi.mocked(readRecoverySnapshots).mockResolvedValue(empty)
  vi.mocked(writeRecoverySnapshot).mockResolvedValue()
  vi.mocked(clearOwnRecoverySnapshot).mockResolvedValue()
  vi.mocked(clearRecoverySnapshots).mockResolvedValue()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('recovery scheduling lifecycle', () => {
  it('copies fresh edits promptly after an hour suspended during a write', async () => {
    let finish!: () => void
    vi.mocked(writeRecoverySnapshot).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    renderHook(useRecoverySnapshot)
    await advance(0)
    edit('Before sleep')
    await advance(5_000)
    await advance(3_600_000)
    await act(async () => {
      finish()
    })
    edit('After wake')
    await advance(5_000)
    expect(writeRecoverySnapshot).toHaveBeenCalledTimes(2)
    expect(vi.mocked(writeRecoverySnapshot).mock.lastCall?.[0].name).toBe('After wake')
  })
  it.each([-3_600_000, 3_600_000])(
    'ignores a wall-clock adjustment of %s ms when scheduling',
    async (jump) => {
      renderHook(useRecoverySnapshot)
      await advance(0)
      edit()
      await advance(5_000)
      vi.setSystemTime(Date.now() + jump)
      edit('After adjustment')
      await advance(30_000)
      expect(writeRecoverySnapshot).toHaveBeenCalledTimes(2)
      expect(useRecoveryStore.getState().savedAt).toBe(Date.now())
    }
  )
  it('resumes protection after a canceled quit and orders the new copy after pending cleanup', async () => {
    renderHook(useRecoverySnapshot)
    await advance(0)
    edit()
    await advance(5_000)
    let finish!: () => void
    vi.mocked(clearOwnRecoverySnapshot).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    let closing!: Promise<void>
    await act(async () => {
      closing = useRecoveryStore.getState().prepareExit()
    })
    edit('Keep editing')
    await act(async () => useRecoveryStore.getState().cancelExit())
    await advance(5_000)
    expect(writeRecoverySnapshot).toHaveBeenCalledTimes(1)
    await act(async () => {
      finish()
      await closing
    })
    expect(writeRecoverySnapshot).toHaveBeenCalledTimes(2)
    expect(vi.mocked(writeRecoverySnapshot).mock.lastCall?.[0].name).toBe('Keep editing')
    expect(useRecoveryStore.getState()).toMatchObject({ closing: false, stored: true })
  })
  it('captures edits during a delayed launch scan under StrictMode and writes only after it completes', async () => {
    let finish!: (value: Storage.StoredRecovery) => void
    vi.mocked(readRecoverySnapshots).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    renderHook(useRecoverySnapshot, { wrapper: StrictMode })
    await advance(0)
    edit()
    await advance(60_000)
    expect(writeRecoverySnapshot).not.toHaveBeenCalled()
    await act(async () => {
      finish(empty)
    })
    expect(readRecoverySnapshots).toHaveBeenCalledTimes(1)
    expect(writeRecoverySnapshot).toHaveBeenCalledTimes(1)
    expect(vi.mocked(writeRecoverySnapshot).mock.calls[0]?.[0].name).toBe('edited')
  })
  it.each([false, true])(
    'writes again after Off/On without an edit (failed first write: %s)',
    async (failed) => {
      if (failed) {
        vi.mocked(writeRecoverySnapshot).mockRejectedValueOnce(new Error('disk full'))
      }
      renderHook(useRecoverySnapshot)
      await advance(0)
      edit()
      await advance(5_000)
      expect(writeRecoverySnapshot).toHaveBeenCalledTimes(1)
      await advance(60_000)
      expect(writeRecoverySnapshot).toHaveBeenCalledTimes(1)
      await act(async () => useRecoveryStore.getState().setEnabled(false))
      await act(async () => useRecoveryStore.getState().setEnabled(true))
      await advance(5_000)
      expect(writeRecoverySnapshot).toHaveBeenCalledTimes(2)
      expect(useRecoveryStore.getState().status).toBe('saved')
    }
  )
  it('writes during sustained editing without a five-second gap', async () => {
    renderHook(useRecoverySnapshot)
    await advance(0)
    for (let i = 0; i < 16; i++) {
      edit(`revision ${i}`)
      await advance(4_000)
    }
    expect(writeRecoverySnapshot).toHaveBeenCalledTimes(2)
  })
  it('never advertises saved when ownership is unsupported', async () => {
    vi.mocked(canOwnSessions).mockReturnValue(false)
    renderHook(useRecoverySnapshot)
    await advance(0)
    edit()
    await advance(60_000)
    expect(writeRecoverySnapshot).not.toHaveBeenCalled()
    expect(useRecoveryStore.getState().status).toBe('unsupported')
  })
  it('cleans up adopted-only recovery when a real save completes before the first timer', async () => {
    renderHook(useRecoverySnapshot)
    await advance(0)
    edit()
    act(() => useRecoveryStore.setState({ adopted: 'lost', stored: false }))
    await act(async () => {
      const state = useDocumentStore.getState()
      useDocumentStore.setState({ savedDocument: state.document, dirty: false })
    })
    expect(clearRecoverySnapshots).toHaveBeenCalledWith(['lost'])
    expect(writeRecoverySnapshot).not.toHaveBeenCalled()
    expect(useRecoveryStore.getState().adopted).toBeNull()
  })
  it('queues cleanup after an in-flight write when work becomes clean', async () => {
    let finish!: () => void
    vi.mocked(writeRecoverySnapshot).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    renderHook(useRecoverySnapshot)
    await advance(0)
    edit()
    await advance(5_000)
    act(() => useDocumentStore.setState({ dirty: false }))
    expect(clearOwnRecoverySnapshot).not.toHaveBeenCalled()
    await act(async () => {
      finish()
    })
    expect(clearOwnRecoverySnapshot).toHaveBeenCalledTimes(1)
  })
  it('deletes the previous document copy after explicitly replacing it with a clean document', async () => {
    renderHook(useRecoverySnapshot)
    await advance(0)
    edit()
    await advance(5_000)
    await act(async () => useDocumentStore.getState().loadDocument(createEmptyDocument(), null))
    expect(clearOwnRecoverySnapshot).toHaveBeenCalledTimes(1)
    expect(useRecoveryStore.getState().stored).toBe(false)
  })
})
