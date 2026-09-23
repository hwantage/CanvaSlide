import { useEffect } from 'react'
import { confirmDiscardChanges } from '@/platform/document-file-access'
import { installCloseGuard } from '@/platform/window-lifecycle'
import { useDocumentStore, watchDocumentChanges } from '@/store/document-store'
import { useRecoveryStore } from '@/store/recovery-store'

/** Confirms before losing unsaved work on window close, app quit, or browser reload. */
export function useCloseGuard(): void {
  useEffect(
    () =>
      installCloseGuard({
        hasUnsavedWork: () => useDocumentStore.getState().dirty,
        confirmDiscard: confirmDiscardChanges,
        onCleanExit: () => useRecoveryStore.getState().prepareExit(),
        cancelCleanExit: () => useRecoveryStore.getState().cancelExit(),
        watchForChanges: watchDocumentChanges
      }),
    []
  )
}
