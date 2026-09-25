import type { Update } from '@tauri-apps/plugin-updater'
import { isTauriRuntime } from './tauri-runtime'
import { openExternalUrl } from './external-links'

export const RELEASES_URL = 'https://github.com/hwantage/CanvaSlide/releases'

/** Mirrors `CHECK_UPDATES_EVENT` in `src-tauri/src/lib.rs`. */
const CHECK_UPDATES_EVENT = 'check-updates-requested'

export type AvailableUpdate = {
  version: string
  notes: string | null
  /** True when this build can download and apply the update itself (see `canInstallInApp`). */
  installable: boolean
}

export function currentAppVersion(): string {
  return __APP_VERSION__
}

/**
 * Whether the desktop app can apply the update in `feed` (its latest.json) itself: always on
 * Windows, and on macOS only when the feed marks the update notarized, since a swapped-in .app
 * without Apple's signature may not run.
 */
export function canInstallInApp(feed: Record<string, unknown>): boolean {
  if (!isTauriRuntime()) {
    return false
  }
  if (/Windows/i.test(navigator.userAgent)) {
    return true
  }
  return /Macintosh/i.test(navigator.userAgent) && isNotarizedForMac(feed.platforms)
}

// Every macOS entry comes from the one universal archive, so a partly marked feed is malformed.
function isNotarizedForMac(platforms: unknown): boolean {
  if (typeof platforms !== 'object' || platforms === null) {
    return false
  }
  const mac = Object.entries(platforms).filter(([platform]) => platform.startsWith('darwin-'))
  return (
    mac.length > 0 &&
    mac.every(([, entry]) => (entry as { notarized?: unknown } | null)?.notarized === true)
  )
}

let pendingUpdate: Update | null = null

/** Web deployments are already served at their current version; only desktop checks the feed. */
export async function checkForAppUpdate(): Promise<AvailableUpdate | null> {
  if (!isTauriRuntime()) {
    return null
  }
  const { check } = await import('@tauri-apps/plugin-updater')
  pendingUpdate = await check()
  if (!pendingUpdate) {
    return null
  }
  return {
    version: pendingUpdate.version,
    notes: pendingUpdate.body ?? null,
    installable: canInstallInApp(pendingUpdate.rawJson)
  }
}

/** Downloads and applies the pending update, then restarts. Only valid after a successful check. */
export async function installAppUpdate(onProgress: (fraction: number) => void): Promise<void> {
  if (!pendingUpdate) {
    throw new Error('no pending update')
  }
  let total = 0
  let received = 0
  await pendingUpdate.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      total = event.data.contentLength ?? 0
    } else if (event.event === 'Progress') {
      received += event.data.chunkLength
      onProgress(total > 0 ? Math.min(1, received / total) : 0)
    } else {
      onProgress(1)
    }
  })
  const { relaunch } = await import('@tauri-apps/plugin-process')
  await relaunch()
}

export async function openReleasesPage(): Promise<void> {
  await openExternalUrl(RELEASES_URL)
}

/** Native "Check for Updates…" menu item (macOS). Returns a disposer. */
export function onCheckUpdatesRequested(handler: () => void): () => void {
  if (!isTauriRuntime()) {
    return () => {}
  }
  let disposed = false
  let unlisten = () => {}
  void import('@tauri-apps/api/event').then(async ({ listen }) => {
    const stop = await listen(CHECK_UPDATES_EVENT, handler)
    if (disposed) {
      stop()
    } else {
      unlisten = stop
    }
  })
  return () => {
    disposed = true
    unlisten()
  }
}
