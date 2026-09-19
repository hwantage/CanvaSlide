import { create } from 'zustand'
import { t } from '@/i18n/ui-strings'
import { errorText, showErrorMessage } from '@/platform/document-file-access'
import {
  checkForAppUpdate,
  installAppUpdate,
  openReleasesPage,
  type AvailableUpdate
} from '@/platform/app-update'

export type UpdateStatus = 'idle' | 'checking' | 'upToDate' | 'available' | 'downloading' | 'error'

export type UpdateStore = {
  status: UpdateStatus
  update: AvailableUpdate | null
  /** Download progress 0..1 while `downloading`. */
  progress: number
  error: string | null
  check: () => Promise<void>
  install: () => Promise<void>
  openReleases: () => Promise<void>
}

export const useUpdateStore = create<UpdateStore>()((set, get) => ({
  status: 'idle',
  update: null,
  progress: 0,
  error: null,
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
    if (!update?.installable || status === 'downloading') {
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
  }
}))

export const selectUpdateAvailable = (s: UpdateStore) =>
  s.status === 'available' || s.status === 'downloading'
