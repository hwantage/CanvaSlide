import { useEffect } from 'react'
import { confirmDiscardChanges } from '@/platform/document-file-access'
import { installCloseGuard } from '@/platform/window-lifecycle'
import { useDocumentStore } from '@/store/document-store'

/** Confirms before losing unsaved work on window close, app quit, or browser reload. */
export function useCloseGuard(): void {
  useEffect(
    () =>
      installCloseGuard({
        hasUnsavedWork: () => useDocumentStore.getState().dirty,
        confirmDiscard: confirmDiscardChanges
      }),
    []
  )
}
