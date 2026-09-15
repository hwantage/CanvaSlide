import { isTauriRuntime } from './tauri-runtime'

/** Mirrors `QUIT_REQUESTED_EVENT` in `src-tauri/src/lib.rs`. */
const QUIT_REQUESTED_EVENT = 'quit-requested'

export type CloseGuard = {
  hasUnsavedWork: () => boolean
  confirmDiscard: () => Promise<boolean>
}

/** Asks before the window closes or the app quits with unsaved work. Returns a disposer. */
export function installCloseGuard(guard: CloseGuard): () => void {
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (guard.hasUnsavedWork()) {
      event.preventDefault()
      // Why: older engines only show the leave-page prompt when returnValue is set.
      event.returnValue = ''
    }
  }
  window.addEventListener('beforeunload', onBeforeUnload)
  const disposeNative = isTauriRuntime() ? installTauriCloseGuard(guard) : () => {}
  return () => {
    window.removeEventListener('beforeunload', onBeforeUnload)
    disposeNative()
  }
}

function installTauriCloseGuard(guard: CloseGuard): () => void {
  let disposed = false
  let asking = false
  const unlisteners: (() => void)[] = []
  const mayQuit = async (): Promise<boolean> => {
    if (!guard.hasUnsavedWork()) {
      return true
    }
    if (asking) {
      return false
    }
    asking = true
    try {
      return await guard.confirmDiscard()
    } finally {
      asking = false
    }
  }
  void Promise.all([
    import('@tauri-apps/api/window'),
    import('@tauri-apps/api/event'),
    import('@tauri-apps/api/core')
  ]).then(async ([{ getCurrentWindow }, { listen }, { invoke }]) => {
    const quit = async () => {
      if (await mayQuit()) {
        await invoke('quit_app')
      }
    }
    // Why: single-window app — closing the window is quitting. Always take over the close so the
    // exit goes through `quit_app`, which the Rust side lets through without asking again.
    const unlistenClose = await getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault()
      void quit()
    })
    // Why: the ack proves the webview is alive; without it Rust lets the next quit through.
    const unlistenQuit = await listen(QUIT_REQUESTED_EVENT, () => {
      void invoke('acknowledge_quit')
      void quit()
    })
    if (disposed) {
      unlistenClose()
      unlistenQuit()
      return
    }
    unlisteners.push(unlistenClose, unlistenQuit)
  })
  return () => {
    disposed = true
    for (const unlisten of unlisteners) {
      unlisten()
    }
  }
}
