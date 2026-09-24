/**
 * Where a recovery copy lives, and who is allowed to touch it.
 *
 * Tauri writes into the app data directory and a browser into IndexedDB, but both answer to the
 * same rule: nothing is read, written or deleted without holding that session's claim, so two
 * launches can never act on the same record at once.
 */
import {
  inspectRecoverySnapshot,
  MAX_SNAPSHOT_BYTES,
  RECOVERY_SNAPSHOT_VERSION,
  type RecoveryInspection,
  type RecoverySnapshotInfo,
  type RecoverySnapshotMeta,
  type SnapshotFile
} from '@shared/canvas/recovery-snapshot'
import {
  claimRecoverySession,
  currentSessionId,
  ownsRecoverySession,
  releaseRecoverySession,
  supportsSessionOwnership
} from './recovery-session'
import { decodeRecoveryFile, encodeRecoverySnapshot } from '@/lib/document-file-codec'
import {
  clearStoredSnapshots,
  listStoredSessions,
  readStoredSnapshot,
  readStoredMetadata,
  RecoveryStorageUnavailableError,
  writeStoredSnapshot
} from './recovery-database'
import { displayFilePath, type FilePath } from './file-path'
import { isTauriRuntime } from './tauri-runtime'

export type RecoveryLocation = { kind: 'directory'; path: string } | { kind: 'browser' }
export type RecoveryWriteFailure = 'quota' | 'unavailable' | 'failed'
export class RecoveryWriteError extends Error {
  constructor(
    readonly reason: RecoveryWriteFailure,
    message: string
  ) {
    super(message)
  }
}
function writeFailure(error: unknown): RecoveryWriteError {
  const message = error instanceof Error ? error.message : String(error)
  const quota =
    error instanceof DOMException
      ? error.name === 'QuotaExceededError'
      : /quota|no space left|disk (is )?full|size limit/i.test(message)
  return new RecoveryWriteError(
    quota ? 'quota' : error instanceof RecoveryStorageUnavailableError ? 'unavailable' : 'failed',
    message
  )
}
export function canOwnSessions(): boolean {
  return isTauriRuntime() || supportsSessionOwnership()
}
/** Why every entry point checks: a claim proves no other launch is acting on this record. */
function requireOwnership(id: string): void {
  if (!ownsRecoverySession(id)) {
    throw new Error('Recovery session is not owned')
  }
}
export async function writeRecoverySnapshot(
  document: Parameters<typeof encodeRecoverySnapshot>[0],
  meta: RecoverySnapshotMeta
): Promise<void> {
  const sessionId = currentSessionId()
  requireOwnership(sessionId)
  try {
    const bytes = await encodeRecoverySnapshot(document, meta)
    if (bytes.byteLength > MAX_SNAPSHOT_BYTES) {
      throw new Error('Recovery snapshot exceeds size limit')
    }
    requireOwnership(sessionId)
    if (isTauriRuntime()) {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('write_recovery_snapshot', bytes, {
        headers: { 'x-recovery-session': sessionId }
      })
    } else {
      await writeStoredSnapshot(sessionId, bytes, { version: RECOVERY_SNAPSHOT_VERSION, ...meta })
    }
  } catch (error) {
    throw writeFailure(error)
  }
}
export type StoredSession = {
  sessionId: string
  snapshot: RecoverySnapshotInfo
  abandoned: boolean
}
export type QuarantinedSession = { sessionId: string; version: number | null }
export type StoredRecovery = {
  sessions: StoredSession[]
  quarantined: QuarantinedSession[]
  failures: string[]
}

async function readInfo(id: string): Promise<{
  inspection: RecoveryInspection | null
  warning?: string
}> {
  if (isTauriRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core')
    const raw = await invoke<unknown>('read_recovery_info', { sessionId: id })
    const warning =
      raw &&
      typeof raw === 'object' &&
      'temporaryError' in raw &&
      typeof raw.temporaryError === 'string'
        ? raw.temporaryError
        : undefined
    return {
      inspection: raw === null ? null : inspectRecoverySnapshot(raw),
      ...(warning ? { warning } : {})
    }
  }
  const record = await readStoredMetadata(id)
  return { inspection: record === null ? null : inspectRecoverySnapshot(record.info) }
}
export async function readRecoverySnapshots(
  excluded: readonly string[] = []
): Promise<StoredRecovery> {
  const ids = isTauriRuntime()
    ? await (await import('@tauri-apps/api/core')).invoke<string[]>('list_recovery_sessions')
    : await listStoredSessions()
  const result: StoredRecovery = { sessions: [], quarantined: [], failures: [] }
  for (const sessionId of ids) {
    if (sessionId === currentSessionId() || excluded.includes(sessionId)) {
      continue
    }
    try {
      if (!(await claimRecoverySession(sessionId))) {
        continue
      }
      const { inspection, warning } = await readInfo(sessionId)
      if (warning) {
        result.failures.push(warning)
      }
      if (inspection === null) {
        await releaseRecoverySession(sessionId)
        continue
      }
      if (inspection.kind === 'valid') {
        result.sessions.push({ sessionId, snapshot: inspection.snapshot, abandoned: true })
      } else {
        result.quarantined.push({ sessionId, version: inspection.version })
      }
    } catch (error) {
      result.failures.push(error instanceof Error ? error.message : String(error))
      await releaseRecoverySession(sessionId)
    }
  }
  return result
}

/** IO/worker failures reject; malformed data is a separate result and is retained. */
export async function readRecoveryDocument(sessionId: string) {
  requireOwnership(sessionId)
  let payload: Uint8Array<ArrayBuffer>
  if (isTauriRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core')
    payload = new Uint8Array(await invoke<ArrayBuffer>('read_recovery_snapshot', { sessionId }))
  } else {
    const record = await readStoredSnapshot(sessionId)
    if (record === null) {
      throw new Error('Recovery snapshot is missing')
    }
    payload = record.payload
  }
  return decodeRecoveryFile(payload)
}
export async function clearRecoverySnapshots(sessionIds: readonly string[]): Promise<void> {
  if (sessionIds.length === 0) {
    return
  }
  sessionIds.forEach(requireOwnership)
  if (isTauriRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('clear_recovery_snapshots', { sessionIds })
  } else {
    await clearStoredSnapshots(sessionIds)
  }
}
export function clearOwnRecoverySnapshot(): Promise<void> {
  return clearRecoverySnapshots([currentSessionId()])
}
export function snapshotFile(filePath: FilePath | null): SnapshotFile | null {
  return filePath === null ? null : { display: displayFilePath(filePath), handle: filePath }
}
export function snapshotFilePath(file: SnapshotFile | null): FilePath | null {
  const handle = file?.handle
  if (typeof handle === 'string') {
    return handle.includes('\0') || handle.length === 0 ? null : handle
  }
  if (!handle || typeof handle !== 'object' || !('encoding' in handle)) {
    return null
  }
  const value = handle as Record<string, unknown>
  if (typeof value.display !== 'string') {
    return null
  }
  const windows = /Windows/.test(navigator.userAgent)
  const data =
    value.encoding === 'windows-wide' && windows
      ? value.units
      : value.encoding === 'unix-bytes' && !windows
        ? value.bytes
        : null
  const max = windows ? 65535 : 255
  return Array.isArray(data) &&
    data.length > 0 &&
    data.every((n: unknown) => typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= max)
    ? (handle as FilePath)
    : null
}
export async function recoveryLocation(): Promise<RecoveryLocation> {
  if (!isTauriRuntime()) {
    return { kind: 'browser' }
  }
  const { invoke } = await import('@tauri-apps/api/core')
  return { kind: 'directory', path: await invoke<string>('recovery_directory') }
}
