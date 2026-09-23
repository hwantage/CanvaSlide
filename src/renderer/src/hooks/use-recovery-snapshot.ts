/**
 * Keeps a local recovery copy of unsaved work and offers what a lost session left behind.
 *
 * All the timing lives in `nextSnapshotAction`; this only reports what happened and acts on the
 * answer. Progress is kept outside React because a countdown between copies is not something the
 * interface should re-render for.
 */
import { useEffect } from 'react'
import { nextSnapshotAction, type SnapshotProgress } from '@shared/canvas/recovery-snapshot'
import { snapshotFile } from '@/platform/recovery-storage'
import { useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'
import { useRecoveryStore } from '@/store/recovery-store'

export function useRecoverySnapshot(): void {
  useEffect(() => {
    const progress: SnapshotProgress = {
      changedAt: null,
      pendingSince: null,
      revision: 0,
      attemptedRevision: -1,
      writeStartedAt: null,
      writeDurationMs: 0,
      stored: false,
      writing: false
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    let disposed = false
    let clearing = false
    const changed = () => {
      progress.changedAt = performance.now()
      progress.pendingSince ??= progress.changedAt
      progress.revision += 1
    }
    if (useDocumentStore.getState().dirty) {
      changed()
    }
    const step = () => {
      clearTimeout(timer)
      if (disposed || clearing) {
        return
      }
      const recovery = useRecoveryStore.getState()
      if (!recovery.ready) {
        return
      }
      const { document, dirty, filePath } = useDocumentStore.getState()
      const action = nextSnapshotAction({
        ...progress,
        stored: recovery.stored || recovery.adopted !== null,
        enabled: recovery.enabled,
        offered: recovery.prompting || recovery.busy || recovery.closing,
        dirty,
        now: performance.now()
      })
      if (action.kind === 'wait') {
        timer = setTimeout(step, action.delayMs)
      } else if (action.kind === 'clear') {
        clearing = true
        void recovery.clear().then(
          () => {
            clearing = false
            step()
          },
          () => {
            clearing = false
          }
        )
      } else if (action.kind === 'write') {
        const startedAt = performance.now()
        progress.writing = true
        progress.writeStartedAt = startedAt
        progress.attemptedRevision = progress.revision
        progress.pendingSince = null
        const meta = {
          file: snapshotFile(filePath),
          documentName: document.name,
          savedAt: Date.now()
        }
        void recovery
          .save({ ...document, camera: useCameraStore.getState().camera }, meta)
          .finally(() => {
            progress.writing = false
            progress.writeDurationMs = performance.now() - startedAt
            step()
          })
      }
    }
    const documentSubscription = useDocumentStore.subscribe((state, previous) => {
      if (state.document !== previous.document) {
        changed()
      }
      if (state.session !== previous.session) {
        progress.writeStartedAt = null
        progress.pendingSince = performance.now()
      }
      if (state.document !== previous.document || state.dirty !== previous.dirty) {
        step()
      }
    })
    const recoverySubscription = useRecoveryStore.subscribe((state, previous) => {
      if ((state.enabled && !previous.enabled) || (!state.closing && previous.closing)) {
        changed()
        progress.writeStartedAt = null
      }
      if (
        state.enabled !== previous.enabled ||
        state.prompting !== previous.prompting ||
        state.ready !== previous.ready ||
        state.closing !== previous.closing ||
        state.busy !== previous.busy
      ) {
        step()
      }
    })
    if (!useRecoveryStore.getState().ready) {
      void useRecoveryStore.getState().initialize()
    }
    step()
    return () => {
      disposed = true
      clearTimeout(timer)
      documentSubscription()
      recoverySubscription()
    }
  }, [])
}
