import { create } from 'zustand'

export type ExportDialogStore = {
  open: boolean
  show: () => void
  hide: () => void
}

export const useExportDialogStore = create<ExportDialogStore>()((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false })
}))
