import { useEffect } from 'react'
import { onCheckUpdatesRequested } from '@/platform/app-update'
import { isTauriRuntime } from '@/platform/tauri-runtime'
import { useAboutDialogStore } from '@/store/modal-dialogs'
import { useUpdateStore } from '@/store/update-store'

/** How long after launch to check, so the first paint and document load are never delayed. */
const LAUNCH_CHECK_DELAY_MS = 3000

/** Checks for updates once after launch (desktop, unless turned off) and on the native menu item. */
export function useUpdateCheck(): void {
  useEffect(() => {
    const disposeMenu = onCheckUpdatesRequested(() => {
      useAboutDialogStore.getState().show()
      void useUpdateStore.getState().check()
    })
    if (!isTauriRuntime() || !useUpdateStore.getState().checkOnLaunch) {
      return disposeMenu
    }
    // Why: turning the setting off during the delay must still cancel this launch's check.
    const timer = setTimeout(() => {
      if (useUpdateStore.getState().checkOnLaunch) {
        void useUpdateStore.getState().check()
      }
    }, LAUNCH_CHECK_DELAY_MS)
    return () => {
      clearTimeout(timer)
      disposeMenu()
    }
  }, [])
}
