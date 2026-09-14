import type { Update } from '@tauri-apps/plugin-updater'
import { isNewerVersion } from '@shared/canvas/app-version'
import { isTauriRuntime } from './tauri-runtime'

export const RELEASES_URL = 'https://github.com/hwantage/CanvaSlide/releases/latest'
const LATEST_JSON_URL =
  'https://github.com/hwantage/CanvaSlide/releases/latest/download/latest.json'

/** Mirrors `CHECK_UPDATES_EVENT` in `src-tauri/src/lib.rs`. */
const CHECK_UPDATES_EVENT = 'check-updates-requested'

export type AvailableUpdate = {
  version: string
  notes: string | null
  /** True when this build can download and apply the update itself (Windows desktop). */
  installable: boolean
}

export function currentAppVersion(): string {
  return __APP_VERSION__
}

/** In-app installs are limited to Windows: macOS needs Apple signing before a swapped .app runs. */
export function canInstallInApp(): boolean {
  return isTauriRuntime() && /Windows/i.test(navigator.userAgent)
}

let pendingUpdate: Update | null = null

/**
 * Desktop: the updater plugin reads latest.json from the release feed (verified at download time
 * with the public key in tauri.conf.json). Browser dev builds fetch the same file directly.
 */
export async function checkForAppUpdate(): Promise<AvailableUpdate | null> {
  const current = currentAppVersion()
  if (isTauriRuntime()) {
    const { check } = await import('@tauri-apps/plugin-updater')
    pendingUpdate = await check()
    if (!pendingUpdate) {
      return null
    }
    return {
      version: pendingUpdate.version,
      notes: pendingUpdate.body ?? null,
      installable: canInstallInApp()
    }
  }
  const response = await fetch(LATEST_JSON_URL, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  const latest = (await response.json()) as { version?: string; notes?: string }
  if (!latest.version || !isNewerVersion(latest.version, current)) {
    return null
  }
  return { version: latest.version, notes: latest.notes ?? null, installable: false }
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
  if (isTauriRuntime()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(RELEASES_URL)
    return
  }
  window.open(RELEASES_URL, '_blank', 'noopener')
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
