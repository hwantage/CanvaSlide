import { useEffect } from 'react'
import { onCheckUpdatesRequested } from '@/platform/app-update'
import { isTauriRuntime } from '@/platform/tauri-runtime'
import { useSettingsDialogStore } from '@/store/settings-dialog-store'
import { useUpdateStore } from '@/store/update-store'

/** How long after launch to check, so the first paint and document load are never delayed. */
const LAUNCH_CHECK_DELAY_MS = 3000

/** Checks for updates once after launch (desktop only) and on the native menu item. */
export function useUpdateCheck(): void {
  useEffect(() => {
    const disposeMenu = onCheckUpdatesRequested(() => {
      useSettingsDialogStore.getState().show()
      void useUpdateStore.getState().check()
    })
    if (!isTauriRuntime() || !useUpdateStore.getState().checkOnLaunch) {
      return disposeMenu
    }
    const timer = setTimeout(() => void useUpdateStore.getState().check(), LAUNCH_CHECK_DELAY_MS)
    return () => {
      clearTimeout(timer)
      disposeMenu()
    }
  }, [])
}
