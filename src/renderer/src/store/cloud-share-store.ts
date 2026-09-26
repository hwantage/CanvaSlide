import { create } from 'zustand'
import type { CloudShareErrorCode, ShareAccess } from '@shared/cloud-share/share-protocol'
import type { CanvasDocument } from '@shared/canvas/element-types'

type CloudShareStore = {
  open: boolean
  mode: 'publish' | 'load'
  busy: boolean
  url: string | null
  error: CloudShareErrorCode | null
  access: ShareAccess
  presentation: CanvasDocument | null
  setAccess: (access: ShareAccess) => void
}

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
  }
}))
