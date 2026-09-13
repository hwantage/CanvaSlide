import { create } from 'zustand'

export type ShortcutHelpStore = {
  open: boolean
  show: () => void
  hide: () => void
  toggle: () => void
}

export const useShortcutHelpStore = create<ShortcutHelpStore>()((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
  toggle: () => set((s) => ({ open: !s.open }))
}))
