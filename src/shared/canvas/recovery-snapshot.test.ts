import { describe, expect, it } from 'vitest'
import {
  inspectRecoverySnapshot,
  fitsRecoveryBudget,
  MAX_RECOVERY_BYTES,
  MAX_RECOVERY_RECORDS,
  recoverableSessions,
  MAX_RECOVERABLE_SESSIONS,
  type SnapshotCandidate,
  nextSnapshotAction,
  parseRecoverySnapshot,
  snapshotInterval,
  RECOVERY_SNAPSHOT_VERSION,
  SNAPSHOT_IDLE_MS,
  SNAPSHOT_MIN_INTERVAL_MS,
  SNAPSHOT_MAX_INTERVAL_MS,
  type RecoverySnapshot,
  type SnapshotInput
} from './recovery-snapshot'

const base: SnapshotInput = {
  enabled: true,
  dirty: true,
  offered: false,
  now: 100_000,
  changedAt: 100_000,
  pendingSince: 100_000,
  // One change has arrived and no write has attempted it yet.
  revision: 1,
  attemptedRevision: 0,
  writeStartedAt: null,
  writeDurationMs: 0,
  stored: false,
  writing: false
}

const snapshot: RecoverySnapshot = {
  version: RECOVERY_SNAPSHOT_VERSION,
  file: { display: '/decks/launch.canvaslide', handle: '/decks/launch.canvaslide' },
  documentName: 'Launch',
  savedAt: 5_000,
  contents: '{"version":1}'
}

describe('nextSnapshotAction', () => {
  it('waits out the idle window after a change instead of writing on every keystroke', () => {
    expect(nextSnapshotAction(base)).toEqual({ kind: 'wait', delayMs: SNAPSHOT_IDLE_MS })
    expect(nextSnapshotAction({ ...base, now: base.now + SNAPSHOT_IDLE_MS - 1 })).toEqual({
      kind: 'wait',
      delayMs: 1
    })
    expect(nextSnapshotAction({ ...base, now: base.now + SNAPSHOT_IDLE_MS })).toEqual({
      kind: 'write'
    })
  })

  it('restarts the idle window when a later edit arrives', () => {
    const typing = { ...base, changedAt: base.now + 4_000, now: base.now + 4_000 }
    expect(nextSnapshotAction(typing)).toEqual({ kind: 'wait', delayMs: SNAPSHOT_IDLE_MS })
  })

  it('keeps a floor between successive writes', () => {
    const afterWrite = {
      ...base,
      writeStartedAt: base.now,
      stored: true,
      changedAt: base.now + 1_000,
      now: base.now + SNAPSHOT_IDLE_MS + 1_000
    }
    expect(nextSnapshotAction(afterWrite)).toEqual({
      kind: 'wait',
      delayMs: SNAPSHOT_MIN_INTERVAL_MS - SNAPSHOT_IDLE_MS - 1_000
    })
    expect(nextSnapshotAction({ ...afterWrite, now: base.now + SNAPSHOT_MIN_INTERVAL_MS })).toEqual(
      { kind: 'write' }
    )
  })

  it('pushes the next write out when the last one was slow', () => {
    const slow = {
      ...base,
      writeStartedAt: base.now,
      writeDurationMs: 4_000,
      stored: true,
      changedAt: base.now + 1_000,
      now: base.now + SNAPSHOT_MIN_INTERVAL_MS
    }
    // 4s × 20 = 80s, so the floor no longer decides.
    expect(snapshotInterval(4_000)).toBe(80_000)
    expect(nextSnapshotAction(slow)).toEqual({
      kind: 'wait',
      delayMs: 80_000 - SNAPSHOT_MIN_INTERVAL_MS
    })
  })

  it('uses the plain floor when the previous write took 50ms', () => {
    expect(snapshotInterval(50)).toBe(SNAPSHOT_MIN_INTERVAL_MS)
  })
  it('caps cost backoff even when a prior write includes an hour of suspension', () => {
    expect(snapshotInterval(3_600_000)).toBe(SNAPSHOT_MAX_INTERVAL_MS)
    expect(
      nextSnapshotAction({
        ...base,
        writeStartedAt: base.now,
        writeDurationMs: 3_600_000,
        now: base.now + SNAPSHOT_MAX_INTERVAL_MS
      })
    ).toEqual({ kind: 'write' })
  })

  it.each([
    ['a clean document', { dirty: false }],
    ['an edited document', { dirty: true }]
  ])('leaves an unanswered offer alone, with %s', (_case, state) => {
    // Opening a document the OS handed us clears the dirty flag; without this the scheduler would
    // read that as saved work and delete the copy whose prompt is still on screen.
    expect(nextSnapshotAction({ ...base, ...state, offered: true, stored: true })).toEqual({
      kind: 'idle'
    })
  })

  it('does nothing while a write is in flight', () => {
    expect(nextSnapshotAction({ ...base, writing: true, now: base.now + 60_000 })).toEqual({
      kind: 'idle'
    })
  })

  it('does nothing when the stored copy already covers the last change', () => {
    expect(
      nextSnapshotAction({
        ...base,
        stored: true,
        attemptedRevision: base.revision,
        writeStartedAt: base.now + 1_000,
        now: base.now + 60_000
      })
    ).toEqual({ kind: 'idle' })
  })

  it('does not hammer a backend that just refused: a retry waits for the next edit', () => {
    // A failed write stores nothing, but the attempt already covered the author's last change.
    // Retrying on a timer would spin against a full disk with the warning already up.
    expect(
      nextSnapshotAction({
        ...base,
        stored: false,
        attemptedRevision: base.revision,
        writeStartedAt: base.now + 1_000,
        now: base.now + 120_000
      })
    ).toEqual({ kind: 'idle' })
  })

  it('schedules again when switching recovery back on without another edit', () => {
    // Switching off deletes the copy; an explicit enable bumps the revision so the same work is
    // scheduled again, which a timestamp comparison alone would report as already covered.
    expect(
      nextSnapshotAction({
        ...base,
        stored: false,
        revision: base.revision + 1,
        attemptedRevision: base.revision,
        writeStartedAt: base.now + 1_000,
        now: base.now + 120_000
      })
    ).toEqual({ kind: 'write' })
  })

  it('clears the stored copy once the work is saved, and only if there is one', () => {
    expect(nextSnapshotAction({ ...base, dirty: false, stored: true })).toEqual({ kind: 'clear' })
    expect(nextSnapshotAction({ ...base, dirty: false, stored: false })).toEqual({ kind: 'idle' })
  })

  it('clears the stored copy when the author switches recovery off', () => {
    expect(nextSnapshotAction({ ...base, enabled: false, stored: true })).toEqual({ kind: 'clear' })
    expect(nextSnapshotAction({ ...base, enabled: false, stored: false })).toEqual({ kind: 'idle' })
  })

  it('stays idle before the first change', () => {
    expect(nextSnapshotAction({ ...base, changedAt: null })).toEqual({ kind: 'idle' })
  })
})

describe('parseRecoverySnapshot', () => {
  it('accepts the envelope it writes', () => {
    expect(parseRecoverySnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot)
  })

  it('rejects decoding an envelope from another version', () => {
    expect(parseRecoverySnapshot({ ...snapshot, version: 2 })).toBeNull()
  })

  it('rejects decoding a truncated or mistyped envelope', () => {
    expect(parseRecoverySnapshot({ version: RECOVERY_SNAPSHOT_VERSION })).toBeNull()
    expect(parseRecoverySnapshot({ ...snapshot, savedAt: 'yesterday' })).toBeNull()
    expect(parseRecoverySnapshot(null)).toBeNull()
    expect(parseRecoverySnapshot('{}')).toBeNull()
  })
})

describe('recoverableSessions', () => {
  const candidate = (
    sessionId: string,
    savedAt: number,
    overrides: Partial<SnapshotCandidate> = {}
  ): SnapshotCandidate => ({
    sessionId,
    snapshot: { ...snapshot, savedAt },
    abandoned: true,
    ...overrides
  })

  it('offers every lost session, newest first', () => {
    // Two tabs, two documents, one crash: the older one must not be dropped for the newer.
    const offered = recoverableSessions([candidate('tab-a', 1_000), candidate('tab-b', 2_000)])
    expect(offered.map((entry) => entry.sessionId)).toEqual(['tab-b', 'tab-a'])
  })

  it('leaves a session a live tab still owns out of the list', () => {
    const offered = recoverableSessions([
      candidate('live', 2_000, { abandoned: false }),
      candidate('lost', 1_000)
    ])
    expect(offered.map((entry) => entry.sessionId)).toEqual(['lost'])
  })

  it('retains every unanswered session beyond the prompt batch', () => {
    // The batch size bounds what the prompt shows; nobody's unanswered work is dropped for it.
    const many = Array.from({ length: MAX_RECOVERABLE_SESSIONS + 2 }, (_, index) =>
      candidate(`tab-${index}`, 1_000 + index)
    )
    const offered = recoverableSessions(many)
    expect(offered).toHaveLength(MAX_RECOVERABLE_SESSIONS + 2)
    expect(offered[0]?.sessionId).toBe(`tab-${MAX_RECOVERABLE_SESSIONS + 1}`)
  })

  it('has nothing to say about an empty store', () => {
    expect(recoverableSessions([])).toEqual([])
  })
})

describe('bounded scheduling and storage', () => {
  it('writes after 30 seconds of edits every four seconds without an idle window', () => {
    let input = { ...base, pendingSince: base.now, revision: 1, attemptedRevision: 0 }
    for (let elapsed = 0; elapsed <= 28_000; elapsed += 4_000) {
      input = {
        ...input,
        now: base.now + elapsed,
        changedAt: base.now + elapsed,
        revision: input.revision + 1
      }
      expect(nextSnapshotAction(input).kind).toBe('wait')
    }
    expect(nextSnapshotAction({ ...input, now: base.now + 30_000 })).toEqual({ kind: 'write' })
  })
  it('does not suppress two edits with the same clock timestamp', () => {
    expect(
      nextSnapshotAction({
        ...base,
        revision: 2,
        attemptedRevision: 1,
        writeStartedAt: base.now,
        now: base.now + 30_000
      })
    ).toEqual({ kind: 'write' })
  })
  it('quarantines unknown versions and malformed metadata without deleting them', () => {
    expect(inspectRecoverySnapshot({ ...snapshot, version: 2 })).toEqual({
      kind: 'quarantined',
      version: 2
    })
    expect(inspectRecoverySnapshot(null)).toEqual({ kind: 'quarantined', version: null })
  })
  it('refuses budget overflow rather than selecting old work to evict', () => {
    expect(fitsRecoveryBudget(MAX_RECOVERY_BYTES, MAX_RECOVERY_RECORDS)).toBe(true)
    expect(fitsRecoveryBudget(MAX_RECOVERY_BYTES + 1, 1)).toBe(false)
    expect(fitsRecoveryBudget(1, MAX_RECOVERY_RECORDS + 1)).toBe(false)
  })
})
