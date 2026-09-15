import { isTauriRuntime } from './tauri-runtime'

/** Mirrors `OPEN_FILE_EVENT` in `src-tauri/src/launch_document.rs`. */
const OPEN_FILE_EVENT = 'open-file-requested'

/**
 * Calls back with the document the OS handed the app — at launch, or later when one is opened while
 * the app runs. Browser mode has no such document. Returns a disposer.
 */
export function onLaunchDocument(open: (path: string) => void): () => void {
  if (!isTauriRuntime()) {
    return () => {}
  }
  let disposed = false
  const unlisteners: (() => void)[] = []
  void Promise.all([import('@tauri-apps/api/core'), import('@tauri-apps/api/event')]).then(
    async ([{ invoke }, { listen }]) => {
      // Why: Rust holds the path rather than pushing it, so a launch document that arrived before
      // this listener existed is still picked up by the first drain below.
      const drain = async () => {
        const path = await invoke<string | null>('take_launch_document')
        if (path !== null && !disposed) {
          open(path)
        }
      }
      const stop = await listen(OPEN_FILE_EVENT, () => void drain())
      if (disposed) {
        stop()
        return
      }
      unlisteners.push(stop)
      await drain()
    }
  )
  return () => {
    disposed = true
    for (const unlisten of unlisteners) {
      unlisten()
    }
  }
}
