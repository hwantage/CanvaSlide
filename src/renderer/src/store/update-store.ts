import { create } from 'zustand'
import { t } from '@/i18n/ui-strings'
import { errorText, showErrorMessage } from '@/platform/document-file-access'
import {
  checkForAppUpdate,
  installAppUpdate,
  openReleasesPage,
  type AvailableUpdate
} from '@/platform/app-update'

const CHECK_ON_LAUNCH_KEY = 'canvaslide.updates.checkOnLaunch'

function readCheckOnLaunch(): boolean {
  try {
    return localStorage.getItem(CHECK_ON_LAUNCH_KEY) !== 'off'
  } catch {
    return true
  }
}

export type UpdateStatus = 'idle' | 'checking' | 'upToDate' | 'available' | 'downloading' | 'error'

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
    if (get().status === 'checking' || get().status === 'downloading') {
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
    if (!update?.installable || status === 'checking' || status === 'downloading') {
      return
    }
    set({ status: 'downloading', progress: 0, error: null })
    try {
      await installAppUpdate((progress) => set({ progress }))
    } catch (error) {
      set({ status: 'error', error: errorText(error) })
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
