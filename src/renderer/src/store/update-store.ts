import { create } from 'zustand'
import {
  checkForAppUpdate,
  installAppUpdate,
  openReleasesPage,
  type AvailableUpdate
} from '@/platform/app-update'

const AUTO_CHECK_KEY = 'canvaslide.updates.checkOnLaunch'

function readAutoCheck(): boolean {
  try {
    return localStorage.getItem(AUTO_CHECK_KEY) !== 'off'
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
  checkOnLaunch: readAutoCheck(),
  check: async () => {
    if (get().status === 'checking' || get().status === 'downloading') {
      return
    }
    set({ status: 'checking', error: null })
    try {
      const update = await checkForAppUpdate()
      set({ status: update ? 'available' : 'upToDate', update })
    } catch (error) {
      set({ status: 'error', error: error instanceof Error ? error.message : String(error) })
    }
  },
  install: async () => {
    const { update, status } = get()
    if (!update?.installable || status === 'downloading') {
      return
    }
    set({ status: 'downloading', progress: 0, error: null })
    try {
      await installAppUpdate((progress) => set({ progress }))
    } catch (error) {
      set({ status: 'error', error: error instanceof Error ? error.message : String(error) })
    }
  },
  openReleases: () => openReleasesPage(),
  setCheckOnLaunch: (checkOnLaunch) => {
    set({ checkOnLaunch })
    try {
      localStorage.setItem(AUTO_CHECK_KEY, checkOnLaunch ? 'on' : 'off')
    } catch {
      // Why: the preference is a convenience; blocked storage must not break the dialog.
    }
  }
}))

export const selectUpdateAvailable = (s: UpdateStore) =>
  s.status === 'available' || s.status === 'downloading'
