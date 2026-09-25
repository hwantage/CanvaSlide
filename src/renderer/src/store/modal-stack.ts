import { create } from 'zustand'

/** A mounted modal dialog; `dismiss` is what Escape does to it while it is on top. */
export type ModalDialogEntry = { dismiss: () => void }

type ModalStackStore = {
  /** In the order they opened; the last one is on top. */
  dialogs: readonly ModalDialogEntry[]
}

export const useModalStackStore = create<ModalStackStore>()(() => ({ dialogs: [] }))

/** Registers a dialog as it opens; the returned function removes it as it closes. */
export function pushModalDialog(entry: ModalDialogEntry): () => void {
  useModalStackStore.setState((s) => ({ dialogs: [...s.dialogs, entry] }))
  return () =>
    useModalStackStore.setState((s) => ({ dialogs: s.dialogs.filter((open) => open !== entry) }))
}

/** Whether a modal dialog blocks canvas, clipboard and presentation input. */
export function isModalDialogOpen(): boolean {
  return useModalStackStore.getState().dialogs.length > 0
}

/** Escape closes only the top dialog, as the native cancel does; a dialog below stays open. */
export function dismissTopModalDialog(): void {
  useModalStackStore.getState().dialogs.at(-1)?.dismiss()
}
