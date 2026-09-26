import { isTauriRuntime } from './tauri-runtime'

/** Mirrors `QUIT_REQUESTED_EVENT` in `src-tauri/src/lib.rs`. */
const QUIT_REQUESTED_EVENT = 'quit-requested'

/** How long the exit waits on `onCleanExit` before leaving anyway. */
export const CLEAN_EXIT_TIMEOUT_MS = 2000

export type CloseGuard = {
  hasUnsavedWork: () => boolean
  confirmDiscard: () => Promise<boolean>
  /** Runs once the quit is allowed, before the process goes away. Desktop only — see below. */
  onCleanExit: () => Promise<void>
  cancelCleanExit: () => void
  watchForChanges: (onChange: () => void) => () => void
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
  // Browser unload cannot acknowledge consent; retain recovery copies.
  window.addEventListener('beforeunload', onBeforeUnload)
  const disposeNative = isTauriRuntime() ? installTauriCloseGuard(guard) : () => {}
  return () => {
    window.removeEventListener('beforeunload', onBeforeUnload)
    disposeNative()
  }
}

function installTauriCloseGuard(guard: CloseGuard): () => void {
  let disposed = false
  let quitting = false
  const unlisteners: (() => void)[] = []
  const mayQuit = async (): Promise<boolean> => !guard.hasUnsavedWork() || guard.confirmDiscard()
  void Promise.all([
    import('@tauri-apps/api/window'),
    import('@tauri-apps/api/event'),
    import('@tauri-apps/api/core')
  ]).then(async ([{ getCurrentWindow }, { listen }, { invoke }]) => {
    const quit = async () => {
      if (quitting || disposed) {
        return
      }
      quitting = true
      let changed = false
      let notifyChange!: () => void
      const change = new Promise<void>((resolve) => {
        notifyChange = resolve
      })
      const unwatch = guard.watchForChanges(() => {
        changed = true
        notifyChange()
      })
      let preparing = false
      let timeout: ReturnType<typeof setTimeout> | undefined
      try {
        if (!(await mayQuit()) || changed || disposed) {
          return
        }
        preparing = true
        // Cleanup may stall; edits cancel this quit instead of inheriting an earlier discard decision.
        await Promise.race([
          guard.onCleanExit().catch(() => {}),
          new Promise((resolve) => {
            timeout = setTimeout(resolve, CLEAN_EXIT_TIMEOUT_MS)
          }),
          change
        ])
        if (changed || disposed) {
          guard.cancelCleanExit()
          return
        }
        await invoke('quit_app')
      } catch {
        if (preparing) {
          guard.cancelCleanExit()
        }
      } finally {
        clearTimeout(timeout)
        unwatch()
        quitting = false
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
