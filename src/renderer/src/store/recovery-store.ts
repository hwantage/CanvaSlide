/**
 * The launch scan, the queue of lost sessions waiting for an answer, and the recovery status.
 *
 * Only one document can be open, so the prompt hands back one session at a time; restoring closes
 * it so the author can save what they just got before answering for the rest.
 */
import { create } from 'zustand'
import {
  MAX_RECOVERABLE_SESSIONS,
  recoverableSessions,
  type RecoverySnapshotInfo,
  type RecoverySnapshotMeta
} from '@shared/canvas/recovery-snapshot'
import type { CanvasDocument } from '@shared/canvas/element-types'
import { cameraForOpenedDocument } from '@shared/canvas/frame-fit'
import {
  canOwnSessions,
  clearOwnRecoverySnapshot,
  clearRecoverySnapshots,
  readRecoveryDocument,
  readRecoverySnapshots,
  recoveryLocation,
  RecoveryWriteError,
  snapshotFilePath,
  writeRecoverySnapshot,
  type RecoveryLocation,
  type RecoveryWriteFailure
} from '@/platform/recovery-storage'
import { claimSession, releaseRecoverySession } from '@/platform/recovery-session'
import { confirmDiscardChanges } from '@/platform/document-file-access'
import { useCameraStore } from './camera-store'
import { useDocumentStore, watchDocumentChanges } from './document-store'
import { useExampleStore } from './example-store'

const STORAGE_KEY = 'canvaslide.recovery'
export type RecoveryStatus = 'off' | 'unsupported' | 'idle' | 'saved' | RecoveryWriteFailure
export type RecoveryOffer =
  | { sessionId: string; snapshot: RecoverySnapshotInfo }
  | { sessionId: string; quarantined: true; version: number | null }
export type RecoveryStore = {
  enabled: boolean
  ready: boolean
  scanning: boolean
  busy: boolean
  closing: boolean
  status: RecoveryStatus
  savedAt: number | null
  error: string | null
  scanError: string | null
  location: RecoveryLocation | null
  stored: boolean
  offers: RecoveryOffer[]
  prompting: boolean
  batchRemaining: number
  adopted: string | null
  setEnabled: (enabled: boolean) => void
  initialize: () => Promise<void>
  save: (document: CanvasDocument, meta: RecoverySnapshotMeta) => Promise<void>
  clear: (forExit?: boolean) => Promise<void>
  prepareExit: () => Promise<void>
  cancelExit: () => void
  restoreOffer: () => Promise<void>
  discardOffer: () => Promise<void>
  reviewOffers: () => void
  deferOffers: () => void
}
function readPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export function createRecoveryStore() {
  return create<RecoveryStore>()((set, get) => {
    let initialization: Promise<void> | null = null
    let operations: Promise<unknown> = Promise.resolve()
    let storedSession: number | null = null
    // Why everything destructive goes through one queue: a write that started before a restore
    // must not land afterwards and retire the newly adopted record.
    const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
      const result = operations.then(task)
      operations = result.catch(() => {})
      return result
    }
    const fail = (error: unknown) =>
      set({
        status: error instanceof RecoveryWriteError ? error.reason : 'failed',
        error: message(error)
      })
    const remove = async (id: string) => {
      await clearRecoverySnapshots([id])
      await releaseRecoverySession(id)
    }
    const finishOffer = (id: string) =>
      set((s) => {
        const offers = s.offers.filter((offer) => offer.sessionId !== id)
        const batchRemaining = Math.max(0, s.batchRemaining - 1)
        return { offers, batchRemaining, prompting: offers.length > 0 && batchRemaining > 0 }
      })
    return {
      enabled: readPreference(),
      ready: false,
      scanning: false,
      busy: false,
      closing: false,
      status: readPreference() ? 'idle' : 'off',
      savedAt: null,
      error: null,
      scanError: null,
      location: null,
      stored: false,
      offers: [],
      prompting: false,
      batchRemaining: 0,
      adopted: null,
      setEnabled: (enabled) => {
        try {
          localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
        } catch {
          /* The switch still applies to this session. */
        }
        set({
          enabled,
          status: enabled ? (get().ready ? 'idle' : get().status) : 'off',
          error: null
        })
        if (!enabled) {
          void get().clear().catch(fail)
        }
      },
      initialize: () => {
        if (initialization) {
          return initialization
        }
        if (get().busy) {
          return Promise.resolve()
        }
        set({ scanning: true, scanError: null })
        initialization = Promise.resolve().then(async () => {
          try {
            if (!canOwnSessions() || !(await claimSession())) {
              set({ status: 'unsupported' })
              return
            }
            set({ location: await recoveryLocation() })
            const found = await readRecoverySnapshots(get().adopted ? [get().adopted!] : [])
            const ordered = recoverableSessions(found.sessions)
            const offers: RecoveryOffer[] = [
              ...ordered,
              ...found.quarantined.map((s) => ({ ...s, quarantined: true as const }))
            ].filter((s) => s.sessionId !== get().adopted)
            const firstReady = !get().ready
            set({
              ...(firstReady
                ? { status: get().enabled ? ('idle' as const) : ('off' as const), error: null }
                : {}),
              offers,
              ready: true,
              prompting: offers.length > 0,
              batchRemaining: Math.min(MAX_RECOVERABLE_SESSIONS, offers.length),
              scanError: found.failures.length ? found.failures.join('\n') : null
            })
          } catch (error) {
            set({ scanError: message(error) })
            if (!get().ready) {
              fail(error)
            }
          } finally {
            set({ scanning: false })
            initialization = null
          }
        })
        return initialization
      },
      save: (document, meta) => {
        const session = useDocumentStore.getState().session
        const adopted = get().adopted
        return enqueue(async () => {
          if (
            !get().ready ||
            !get().enabled ||
            get().closing ||
            useDocumentStore.getState().session !== session
          ) {
            return
          }
          try {
            await writeRecoverySnapshot(document, meta)
            storedSession = session
            set({
              status: get().enabled ? 'saved' : 'off',
              savedAt: meta.savedAt,
              stored: true,
              error: null
            })
            if (
              adopted !== null &&
              get().adopted === adopted &&
              useDocumentStore.getState().session === session
            ) {
              await remove(adopted)
              set({ adopted: null })
            }
          } catch (error) {
            fail(error)
          }
        })
      },
      clear: (forExit = false) => {
        const session = useDocumentStore.getState().session
        const adopted = get().adopted
        return enqueue(async () => {
          if (initialization) {
            await initialization
          }
          if (!get().ready || (forExit && !get().closing)) {
            return
          }
          try {
            if (storedSession === null || storedSession <= session) {
              await clearOwnRecoverySnapshot()
              storedSession = null
              set({ stored: false, savedAt: null })
            }
            if (adopted !== null && (!forExit || get().closing)) {
              await remove(adopted)
              if (get().adopted === adopted) {
                set({ adopted: null })
              }
            }
            set({ error: null, status: get().enabled ? (get().stored ? 'saved' : 'idle') : 'off' })
          } catch (error) {
            fail(error)
            throw error
          }
        })
      },
      prepareExit: () => {
        set({ closing: true })
        return get().clear(true)
      },
      cancelExit: () => set({ closing: false }),
      restoreOffer: async () => {
        const offer = get().offers[0]
        if (!offer || 'quarantined' in offer || get().busy || get().scanning) {
          return
        }
        const adopted = get().adopted
        let changed = false
        // Content, not identity: a text remeasurement (e.g. a web font loading) must not cancel it.
        const unwatch = watchDocumentChanges(() => {
          changed = true
        })
        set({ busy: true, error: null })
        try {
          if (useDocumentStore.getState().dirty && !(await confirmDiscardChanges())) {
            get().deferOffers()
            return
          }
          const decoded = await readRecoveryDocument(offer.sessionId)
          if (!decoded.result.ok || !decoded.snapshot) {
            set((s) => ({
              offers: s.offers.map((entry) =>
                entry.sessionId === offer.sessionId
                  ? { sessionId: entry.sessionId, quarantined: true, version: null }
                  : entry
              )
            }))
            return
          }
          if (changed) {
            get().deferOffers()
            return
          }
          unwatch()
          const document = decoded.result.document
          useExampleStore.getState().hide()
          useDocumentStore
            .getState()
            .restoreDocument(document, snapshotFilePath(decoded.snapshot.file))
          const camera = useCameraStore.getState()
          camera.setCamera(document.camera ?? cameraForOpenedDocument(document, camera.viewport))
          set((s) => ({
            offers: s.offers.filter((entry) => entry.sessionId !== offer.sessionId),
            prompting: false,
            batchRemaining: 0,
            adopted: offer.sessionId
          }))
          if (adopted !== null && adopted !== offer.sessionId) {
            await enqueue(() => remove(adopted))
          }
        } catch (error) {
          fail(error)
        } finally {
          unwatch()
          set({ busy: false })
        }
      },
      discardOffer: async () => {
        const offer = get().offers[0]
        if (!offer || get().busy || get().scanning) {
          return
        }
        set({ busy: true, error: null })
        try {
          await enqueue(() => remove(offer.sessionId))
          finishOffer(offer.sessionId)
        } catch (error) {
          fail(error)
        } finally {
          set({ busy: false })
        }
      },
      reviewOffers: () =>
        set((s) => ({
          prompting: s.offers.length > 0,
          batchRemaining: Math.min(MAX_RECOVERABLE_SESSIONS, s.offers.length)
        })),
      deferOffers: () => set({ prompting: false, batchRemaining: 0 })
    }
  })
}
export const useRecoveryStore = createRecoveryStore()
export function isRecoveryFailure(status: RecoveryStatus): boolean {
  return ['quota', 'unavailable', 'failed', 'unsupported'].includes(status)
}
export const selectRecoveryOffers = (s: RecoveryStore): RecoveryOffer[] => s.offers
export const selectRecoveryPrompting = (s: RecoveryStore): boolean => s.prompting
export const selectRecoveryEnabled = (s: RecoveryStore): boolean => s.enabled
export const selectRecoveryStatus = (s: RecoveryStore): RecoveryStatus => s.status
export const selectRecoveryFailed = (s: RecoveryStore): boolean =>
  isRecoveryFailure(s.status) || s.scanError !== null
