import { z } from 'zod'

/**
 * When a recovery copy is worth writing, and which lost sessions are worth offering back.
 *
 * The app cannot ask a crashed process what it was doing, so the only defence against a force quit
 * is a copy written while the session was still alive. Everything here is a decision about timing
 * and ordering; reading and writing the copy is the platform layer's job.
 */

export const RECOVERY_SNAPSHOT_VERSION = 1

/** Edits have to settle first, so a burst of typing costs one copy rather than one per keystroke. */
export const SNAPSHOT_IDLE_MS = 5_000
/** Floor between two writes, however long the author keeps editing. */
export const SNAPSHOT_MIN_INTERVAL_MS = 30_000
/** Suspend and slow IO must not postpone protection for hours. */
export const SNAPSHOT_MAX_INTERVAL_MS = 120_000
/**
 * Ceiling on how long a change may go uncopied.
 *
 * Why this exists at all: the idle window alone lets someone who never pauses for five seconds edit
 * for hours with no copy whatsoever, which is precisely the session this feature exists to protect.
 */
export const SNAPSHOT_MAX_WAIT_MS = 30_000
/**
 * A slow write pushes the next one out, targeting ~5% duty within the maximum interval.
 * Whole-attempt latency includes IO and suspension, so this is not a CPU guarantee.
 */
export const SNAPSHOT_DUTY_CYCLE = 20
/** Bounds one prompt batch, never the records retained in storage. */
export const MAX_RECOVERABLE_SESSIONS = 5
/** Storage budgets refuse a new write rather than evicting work nobody has answered for yet. */
export const MAX_RECOVERY_BYTES = 512 * 1024 * 1024
export const MAX_RECOVERY_RECORDS = 1_000
/** Matches `MAX_DOCUMENT_BYTES` in `document-resources.ts`; bounds one stored envelope. */
export const MAX_SNAPSHOT_BYTES = 256 * 1024 * 1024

/**
 * The file the edits came from, or null for a document never written to one.
 *
 * `handle` is the platform layer's own reference to that file and is echoed back untouched: a
 * native path is not always valid Unicode, and `display` is lossy text that must never be used to
 * address the file again. Only the platform layer knows how to read `handle`.
 */
export const snapshotFileSchema = z.object({ display: z.string(), handle: z.unknown() })
export type SnapshotFile = z.infer<typeof snapshotFileSchema>

/** The envelope without the document it carries, which is all a launch needs to judge it. */
export const recoverySnapshotInfoSchema = z.object({
  version: z.literal(RECOVERY_SNAPSHOT_VERSION),
  file: snapshotFileSchema.nullable(),
  documentName: z.string(),
  savedAt: z.number().int().nonnegative()
})
export const recoverySnapshotSchema = recoverySnapshotInfoSchema.extend({ contents: z.string() })
export type RecoverySnapshot = z.infer<typeof recoverySnapshotSchema>
export type RecoverySnapshotInfo = z.infer<typeof recoverySnapshotInfoSchema>
export type RecoverySnapshotMeta = Omit<RecoverySnapshotInfo, 'version'>

/**
 * What a launch made of one stored envelope.
 *
 * `quarantined` is not a failure to clean up: an envelope this version cannot read may be work a
 * newer version wrote and can still open, so it is kept and reported rather than deleted.
 */
export type RecoveryInspection =
  | { kind: 'valid'; snapshot: RecoverySnapshotInfo }
  | { kind: 'quarantined'; version: number | null }

export function inspectRecoverySnapshot(raw: unknown): RecoveryInspection {
  const result = recoverySnapshotInfoSchema.safeParse(raw)
  if (result.success) {
    return { kind: 'valid', snapshot: result.data }
  }
  const version = raw !== null && typeof raw === 'object' && 'version' in raw ? raw.version : null
  return { kind: 'quarantined', version: typeof version === 'number' ? version : null }
}

/**
 * Wraps an already-serialised document in the stored envelope.
 *
 * Why it takes JSON rather than a document: this runs in the document worker, right after it
 * encodes the document, so a large deck is never stringified on the main thread.
 */
export function serializeRecoverySnapshot(meta: RecoverySnapshotMeta, contents: string): string {
  return JSON.stringify({ version: RECOVERY_SNAPSHOT_VERSION, ...meta, contents })
}

export function parseRecoverySnapshot(raw: unknown): RecoverySnapshot | null {
  const result = recoverySnapshotSchema.safeParse(raw)
  return result.success ? result.data : null
}

/**
 * One stored session, seen from a later launch.
 *
 * `abandoned` is the whole reason a session id exists: several browser tabs share one origin and
 * one store, so a launch has to tell a session whose tab is gone from one a live tab is still
 * writing to. A live tab's copy is not this launch's to offer, and certainly not to delete.
 */
export type SnapshotCandidate = {
  sessionId: string
  snapshot: RecoverySnapshotInfo
  abandoned: boolean
}

/**
 * The lost sessions worth offering back, newest first.
 *
 * Nothing is rejected here on evidence about the work itself. Neither a file timestamp nor an
 * unload event proves that these exact edits were saved or thrown away, so a candidate is only
 * held back when a live session still owns it.
 */
export function recoverableSessions(candidates: readonly SnapshotCandidate[]): SnapshotCandidate[] {
  return candidates
    .filter((candidate) => candidate.abandoned)
    .sort((a, b) => b.snapshot.savedAt - a.snapshot.savedAt)
}

/** What the recovery prompt calls the work it is offering back. */
export function snapshotTitle(snapshot: RecoverySnapshotInfo): string {
  return snapshot.file?.display ?? snapshot.documentName
}

export type SnapshotProgress = {
  /** Monotonic ms of the most recent document change; null before the first one. */
  changedAt: number | null
  /** Monotonic ms the oldest pending change arrived; null when nothing is pending. */
  pendingSince: number | null
  /** Bumped by every change, and by an explicit re-enable so switching on schedules again. */
  revision: number
  /** The revision the last write attempt covered. */
  attemptedRevision: number
  /** Monotonic ms the last write started; null before the first one. */
  writeStartedAt: number | null
  /** How long the last write took, 0 before the first one. */
  writeDurationMs: number
  /** This session's own copy is currently held by the storage backend. */
  stored: boolean
  /** A write is in flight. */
  writing: boolean
}

export type SnapshotInput = SnapshotProgress & {
  /** The author's off switch. */
  enabled: boolean
  /** The document store's own dirty flag; recovery never invents a second notion of "changed". */
  dirty: boolean
  /** The recovery prompt is on screen, waiting for a restore-or-discard answer. */
  offered: boolean
  now: number
}

export type SnapshotAction =
  | { kind: 'idle' }
  | { kind: 'write' }
  | { kind: 'clear' }
  | { kind: 'wait'; delayMs: number }

/** How long to leave between the start of one write and the start of the next. */
export function snapshotInterval(writeDurationMs: number): number {
  return Math.min(
    SNAPSHOT_MAX_INTERVAL_MS,
    Math.max(SNAPSHOT_MIN_INTERVAL_MS, writeDurationMs * SNAPSHOT_DUTY_CYCLE)
  )
}

/**
 * The single decision the scheduler hook acts on: write a copy, drop the stored one, wait a known
 * number of milliseconds, or do nothing until the next change arrives.
 */
export function nextSnapshotAction(input: SnapshotInput): SnapshotAction {
  // An in-flight write decides for itself what happens next when it lands, and nothing is decided
  // while the author is being asked: a document loaded mid-prompt would look like saved work.
  if (input.writing || input.offered) {
    return { kind: 'idle' }
  }
  // Saved work and work the author opted out of protecting both belong on disk, not in recovery.
  if (!input.enabled || !input.dirty) {
    return { kind: input.stored ? 'clear' : 'idle' }
  }
  if (input.changedAt === null) {
    return { kind: 'idle' }
  }
  // Why revisions and not timestamps: a copy that was deleted, or a write that failed, leaves the
  // clock looking as though the work were already covered when no copy exists.
  if (input.revision === input.attemptedRevision) {
    return { kind: 'idle' }
  }
  const dueAt = Math.min(
    input.changedAt + SNAPSHOT_IDLE_MS,
    (input.pendingSince ?? input.changedAt) + SNAPSHOT_MAX_WAIT_MS
  )
  const allowedAt =
    input.writeStartedAt === null
      ? dueAt
      : Math.max(dueAt, input.writeStartedAt + snapshotInterval(input.writeDurationMs))
  return input.now >= allowedAt
    ? { kind: 'write' }
    : { kind: 'wait', delayMs: allowedAt - input.now }
}

/** Quota refuses the new write rather than evicting somebody else's unanswered work. */
export function fitsRecoveryBudget(bytes: number, records: number): boolean {
  return bytes <= MAX_RECOVERY_BYTES && records <= MAX_RECOVERY_RECORDS
}
