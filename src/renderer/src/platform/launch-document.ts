import type { FilePath } from './file-path'
import { t } from '@/i18n/ui-strings'
import { showErrorMessage } from './document-file-access'
import { isTauriRuntime } from './tauri-runtime'

/** Mirrors `OPEN_FILE_EVENT` in `src-tauri/src/launch_document.rs`. */
const OPEN_FILE_EVENT = 'open-file-requested'

/**
 * A path already taken from Rust that no live listener could receive. Rust hands each path over
 * exactly once, so parking it here is what keeps the document from vanishing when the effect is
 * torn down between the invoke and its answer — which React StrictMode does on every mount.
 */
let undelivered: FilePath | null = null

/**
 * Serialises every drain in the process, across listeners.
 *
 * Why: two listeners overlap during a StrictMode remount, and a launch document must survive that.
 * Interleaved drains would let one park a path while the other is mid-flight, and let two documents
 * load at once with the slower read deciding what the window ends up showing.
 */
let draining: Promise<void> = Promise.resolve()

/**
 * Calls back with the document the OS handed the app — at launch, or later when one is opened while
 * the app runs. Browser mode has no such document. Returns a disposer.
 */
export function onLaunchDocument(open: (path: FilePath) => void | Promise<void>): () => void {
  if (!isTauriRuntime()) {
    return () => {}
  }
  let disposed = false
  const unlisteners: (() => void)[] = []
  void Promise.all([import('@tauri-apps/api/core'), import('@tauri-apps/api/event')])
    .then(async ([{ invoke }, { listen }]) => {
      // Why: Rust holds the path rather than pushing it, so a launch document that arrived before
      // this listener existed is still picked up by the first drain below.
      const drain = () => {
        draining = draining.then(async () => {
          const parked = undelivered
          undelivered = null
          const path = parked ?? (await invoke<FilePath | null>('take_launch_document'))
          if (path === null) {
            return
          }
          if (disposed) {
            // Why: the path is already out of Rust and cannot be asked for again, so hand it to
            // whichever listener comes next rather than losing the document.
            undelivered = path
            return
          }
          await open(path)
        })
        return draining
      }
      const stop = await listen(OPEN_FILE_EVENT, () => void drain().catch(reportFailure))
      if (disposed) {
        stop()
        return
      }
      unlisteners.push(stop)
      await drain()
    })
    .catch(reportFailure)
  return () => {
    disposed = true
    for (const unlisten of unlisteners) {
      unlisten()
    }
  }
}

/** Why: the app would otherwise just sit there empty, with no hint the document was ever asked for. */
function reportFailure(error: unknown): void {
  void showErrorMessage(
    t('error.launchDocument', { message: error instanceof Error ? error.message : String(error) })
  )
}
