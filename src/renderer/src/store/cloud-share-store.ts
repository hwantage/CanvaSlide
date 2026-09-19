import { create } from 'zustand'
import {
  CloudShareError,
  shareIdFromSearch,
  type CloudShareErrorCode,
  type ShareAccess
} from '@shared/cloud-share'
import type { CanvasDocument } from '@shared/canvas/element-types'
import { loadSharedDocument } from '@/lib/load-shared-document'
import { clearShareQuery, createCloudShare } from '@/platform/cloud-share'
import { useCameraStore } from './camera-store'
import { useDocumentStore } from './document-store'

type CloudShareStore = {
  open: boolean
  mode: 'publish' | 'load'
  busy: boolean
  url: string | null
  error: CloudShareErrorCode | null
  access: ShareAccess
  presentation: CanvasDocument | null
  setAccess: (access: ShareAccess) => void
  show: () => void
  hide: () => void
  publish: () => Promise<string | null>
  openLink: (search: string) => Promise<void>
}

let pending: AbortController | null = null

export const useCloudShareStore = create<CloudShareStore>()((set, get) => ({
  open: false,
  mode: 'publish',
  busy: false,
  url: null,
  error: null,
  access: 'present',
  presentation: null,
  setAccess: (access) => {
    if (!get().busy) {
      set({ access, url: null, error: null })
    }
  },
  show: () => {
    pending?.abort()
    set({ open: true, mode: 'publish', busy: false, url: null, error: null, access: 'present' })
  },
  hide: () => {
    pending?.abort()
    if (get().open && get().mode === 'load') {
      clearShareQuery()
    }
    set({ open: false, busy: false })
  },
  publish: async () => {
    if (get().busy) {
      return null
    }
    pending?.abort()
    const request = new AbortController()
    pending = request
    set({ busy: true, error: null, url: null })
    try {
      const document = useDocumentStore.getState().document
      const url = await createCloudShare(
        { ...document, camera: useCameraStore.getState().camera },
        request.signal,
        get().access
      )
      if (!request.signal.aborted) {
        set({ busy: false, url })
        return url
      }
    } catch (error) {
      if (!request.signal.aborted) {
        set({ busy: false, error: error instanceof CloudShareError ? error.code : 'unavailable' })
      }
    }
    return null
  },
  openLink: async (search) => {
    pending?.abort()
    const request = new AbortController()
    pending = request
    try {
      const id = shareIdFromSearch(search)
      if (id === null) {
        return
      }
      set({ open: true, mode: 'load', busy: true, url: null, error: null })
      const snapshot = await loadSharedDocument(id, request.signal)
      if (!request.signal.aborted && snapshot) {
        set({
          open: false,
          busy: false,
          presentation: snapshot.access === 'present' ? snapshot.document : null
        })
      }
    } catch (error) {
      if (!request.signal.aborted) {
        set({
          open: true,
          mode: 'load',
          url: null,
          busy: false,
          error: error instanceof CloudShareError ? error.code : 'unavailable'
        })
      }
    }
  }
}))

// React StrictMode cleans up and starts the launch effect again; keep its query intact.
export function cancelShareRequest(): void {
  pending?.abort()
}
