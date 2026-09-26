import { create } from 'zustand'
import { t } from '@/i18n/ui-strings'
import { errorText, showErrorMessage } from '@/platform/document-file-access'
import {
  checkForAppUpdate,
  confirmUpdateChanges,
  installAppUpdate,
  openReleasesPage,
  type AvailableUpdate
} from '@/platform/app-update'
import { CLEAN_EXIT_TIMEOUT_MS } from '@/platform/window-lifecycle'
import { useRecoveryStore } from './recovery-store'
import { saveCurrentDocument } from '@/lib/document/save-document'
import { useDocumentStore, watchDocumentChanges } from '@/store/document-store'

const CHECK_ON_LAUNCH_KEY = 'canvaslide.updates.checkOnLaunch'

function readCheckOnLaunch(): boolean {
  try {
    return localStorage.getItem(CHECK_ON_LAUNCH_KEY) !== 'off'
  } catch {
    return true
  }
}

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'upToDate'
  | 'available'
  | 'confirming'
  | 'downloading'
  | 'error'

export type UpdateStore = {
  status: UpdateStatus
  update: AvailableUpdate | null
  /** Download progress 0..1 while `downloading`. */
  progress: number
  error: string | null
  /** Whether the desktop app checks once after launch; manual checks work either way. */
  checkOnLaunch: boolean
  check: () => Promise<void>
  install: () => Promise<void>
  openReleases: () => Promise<void>
  setCheckOnLaunch: (enabled: boolean) => void
}

export const useUpdateStore = create<UpdateStore>()((set, get) => ({
  status: 'idle',
  update: null,
  progress: 0,
  error: null,
  checkOnLaunch: readCheckOnLaunch(),
  check: async () => {
    if (['checking', 'confirming', 'downloading'].includes(get().status)) {
      return
    }
    set({ status: 'checking', error: null })
    try {
      const update = await checkForAppUpdate()
      set({ status: update ? 'available' : 'upToDate', update })
    } catch (error) {
      set({ status: 'error', error: errorText(error) })
    }
  },
  install: async () => {
    const { update, status } = get()
    // Why: a running check replaces the pending update the download would read.
    if (!update?.installable || ['checking', 'confirming', 'downloading'].includes(status)) {
      return
    }
    if (useDocumentStore.getState().editBaseline) {
      return
    }
    set({ status: 'confirming', progress: 0, error: null })
    let changed = false
    let notifyChange!: () => void
    const change = new Promise<void>((resolve) => {
      notifyChange = resolve
    })
    const unwatch = watchDocumentChanges(() => {
      changed = true
      notifyChange()
    })
    const mayInstall = () => !changed && !useDocumentStore.getState().editBaseline
    let preparing = false
    let installed = false
    const prepareInstall = async () => {
      preparing = true
      let timeout: ReturnType<typeof setTimeout> | undefined
      try {
        // Match normal quit: stalled cleanup is bounded, and new edits cancel the exit.
        await Promise.race([
          useRecoveryStore
            .getState()
            .prepareExit()
            .catch(() => {}),
          new Promise((resolve) => {
            timeout = setTimeout(resolve, CLEAN_EXIT_TIMEOUT_MS)
          }),
          change
        ])
      } finally {
        clearTimeout(timeout)
      }
    }
    try {
      if (useDocumentStore.getState().dirty) {
        const choice = await confirmUpdateChanges()
        if (choice === 'cancel' || !mayInstall()) {
          set({ status: 'available' })
          return
        }
        if (choice === 'save' && !(await saveCurrentDocument())) {
          set({ status: 'available' })
          return
        }
      }
      if (!mayInstall()) {
        set({ status: 'available' })
        return
      }
      set({ status: 'downloading' })
      installed = await installAppUpdate(
        (progress) => set({ progress }),
        mayInstall,
        prepareInstall
      )
      if (!installed) {
        set({ status: 'available', progress: 0 })
      }
    } catch (error) {
      set({ status: 'error', error: errorText(error) })
    } finally {
      if (preparing && !installed) {
        useRecoveryStore.getState().cancelExit()
      }
      unwatch()
    }
  },
  openReleases: async () => {
    try {
      await openReleasesPage()
    } catch (error) {
      await showErrorMessage(t('update.openReleasesError', { message: errorText(error) }))
    }
  },
  setCheckOnLaunch: (checkOnLaunch) => {
    set({ checkOnLaunch })
    try {
      localStorage.setItem(CHECK_ON_LAUNCH_KEY, checkOnLaunch ? 'on' : 'off')
    } catch {
      // Why: the preference is a convenience; blocked storage must not break the dialog.
    }
  }
}))

/** A found update stays offered while a later check runs or fails, as About keeps showing it. */
export const selectUpdateAvailable = (s: UpdateStore) => s.update !== null
