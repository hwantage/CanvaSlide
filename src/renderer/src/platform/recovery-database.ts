/**
 * The browser half of recovery storage: one record per editing session.
 *
 * Why two object stores: a launch has to judge every stored session, and reading whole documents
 * to do it would put tens of megabytes of embedded images in memory at once. Metadata lives apart
 * from the payload so a scan touches only the small half, and the pair is written in one
 * transaction so a record is never half-updated.
 *
 * Why IndexedDB and not localStorage: a deck with embedded images runs far past what localStorage
 * accepts, and IndexedDB reports a full quota as a `QuotaExceededError` the caller can show.
 */
import {
  fitsRecoveryBudget,
  MAX_SNAPSHOT_BYTES,
  type RecoverySnapshotInfo
} from '@shared/canvas/recovery-snapshot'

const DATABASE_NAME = 'canvaslide-recovery'
const STORE_NAME = 'snapshots'
const PAYLOAD_STORE = 'payloads'
export class RecoveryStorageUnavailableError extends Error {}
export type StoredSnapshot = { info: RecoverySnapshotInfo; payload: Uint8Array<ArrayBuffer> }
/** `null` means no record, as on native; anything unrecognised is kept for quarantine. */
export type StoredMetadata = { info: unknown } | null

type SnapshotIndex = { info: RecoverySnapshotInfo; bytes: number }
function request<T>(source: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    source.onsuccess = () => resolve(source.result)
    source.onerror = () => reject(source.error ?? new Error('IndexedDB request failed'))
  })
}
function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new RecoveryStorageUnavailableError('IndexedDB is not available')
  }
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DATABASE_NAME, 2)
    let rejected = false
    const timer = setTimeout(() => {
      rejected = true
      reject(new RecoveryStorageUnavailableError('IndexedDB open timed out'))
    }, 5000)
    open.onupgradeneeded = () => {
      open.result.createObjectStore(STORE_NAME)
      open.result.createObjectStore(PAYLOAD_STORE)
    }
    open.onsuccess = () => {
      clearTimeout(timer)
      // Why: another tab upgrading the schema is blocked until this connection closes.
      open.result.onversionchange = () => open.result.close()
      if (rejected) {
        open.result.close()
      } else {
        resolve(open.result)
      }
    }
    open.onerror = () => {
      clearTimeout(timer)
      reject(open.error ?? new RecoveryStorageUnavailableError('IndexedDB open failed'))
    }
    open.onblocked = () => {
      rejected = true
      clearTimeout(timer)
      reject(new RecoveryStorageUnavailableError('IndexedDB is blocked'))
    }
  })
}
async function withStores<T>(
  mode: IDBTransactionMode,
  run: (index: IDBObjectStore, payloads: IDBObjectStore) => Promise<T>
): Promise<T> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction([STORE_NAME, PAYLOAD_STORE], mode, {
      durability: 'strict'
    })
    const settled = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error ?? new Error('Transaction aborted'))
      transaction.onerror = () => reject(transaction.error ?? new Error('Transaction failed'))
    })
    const task = run(
      transaction.objectStore(STORE_NAME),
      transaction.objectStore(PAYLOAD_STORE)
    ).catch((error: unknown) => {
      try {
        transaction.abort()
      } catch {
        /* An aborted transaction already retained the previous record. */
      }
      throw error
    })
    task.catch(() => {})
    settled.catch(() => {})
    const [result] = await Promise.all([task, settled])
    return result
  } finally {
    database.close()
  }
}
export function listStoredSessions(): Promise<string[]> {
  return withStores('readonly', async (index) =>
    (await request(index.getAllKeys())).filter((key): key is string => typeof key === 'string')
  )
}
export function readStoredMetadata(id: string): Promise<StoredMetadata> {
  return withStores('readonly', async (index) => {
    const value: unknown = await request(index.get(id))
    if (value === undefined) {
      return null
    }
    return { info: value && typeof value === 'object' && 'info' in value ? value.info : value }
  })
}
export function readStoredSnapshot(id: string): Promise<StoredSnapshot | null> {
  return withStores('readonly', async (index, payloads) => {
    const value: unknown = await request(index.get(id))
    if (!value || typeof value !== 'object' || !('info' in value)) {
      return null
    }
    const info = value.info as RecoverySnapshotInfo
    const payload: unknown = await request(payloads.get(id))
    return payload instanceof Uint8Array && payload.buffer instanceof ArrayBuffer
      ? { info, payload: new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength) }
      : null
  })
}
function budgetExcluding(
  index: IDBObjectStore,
  id: string
): Promise<{ bytes: number; records: number }> {
  return new Promise((resolve, reject) => {
    let bytes = 0,
      records = 0
    const cursor = index.openCursor()
    cursor.onerror = () => reject(cursor.error)
    cursor.onsuccess = () => {
      const entry = cursor.result
      if (!entry) {
        resolve({ bytes, records })
        return
      }
      if (entry.key !== id) {
        records++
        const value: unknown = entry.value
        bytes +=
          value &&
          typeof value === 'object' &&
          'bytes' in value &&
          typeof value.bytes === 'number' &&
          Number.isFinite(value.bytes) &&
          value.bytes >= 0
            ? value.bytes
            : MAX_SNAPSHOT_BYTES
      }
      entry.continue()
    }
  })
}
export function writeStoredSnapshot(
  id: string,
  bytes: Uint8Array<ArrayBuffer>,
  info: RecoverySnapshotInfo
): Promise<void> {
  return withStores('readwrite', async (index, payloads) => {
    const budget = await budgetExcluding(index, id)
    if (
      bytes.byteLength > MAX_SNAPSHOT_BYTES ||
      !fitsRecoveryBudget(budget.bytes + bytes.byteLength, budget.records + 1)
    ) {
      throw new DOMException('Recovery storage size limit', 'QuotaExceededError')
    }
    const metadata: SnapshotIndex = { info, bytes: bytes.byteLength }
    await Promise.all([request(payloads.put(bytes, id)), request(index.put(metadata, id))])
  })
}
export function clearStoredSnapshots(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) {
    return Promise.resolve()
  }
  return withStores('readwrite', async (index, payloads) => {
    await Promise.all(
      ids.flatMap((id) => [request(index.delete(id)), request(payloads.delete(id))])
    )
  })
}
