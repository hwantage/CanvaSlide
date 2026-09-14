import { create } from 'zustand'
import { listSystemFonts } from '@/platform/system-fonts'

export type FontStore = {
  /** Installed families, empty until loaded (and on platforms that cannot list them). */
  families: string[]
  status: 'idle' | 'loading' | 'ready'
  load: () => Promise<void>
}

/** Loaded once per session on first use of the font picker. */
export const useFontStore = create<FontStore>()((set, get) => ({
  families: [],
  status: 'idle',
  load: async () => {
    if (get().status !== 'idle') {
      return
    }
    set({ status: 'loading' })
    try {
      set({ families: await listSystemFonts(), status: 'ready' })
    } catch {
      set({ status: 'ready' })
    }
  }
}))
