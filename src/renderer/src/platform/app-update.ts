import type { Update } from '@tauri-apps/plugin-updater'
import { isTauriRuntime } from './tauri-runtime'
import { openExternalUrl } from './external-links'
import { t } from '@/i18n/ui-strings'

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
let downloaded = false

/** Web deployments are already served at their current version; only desktop checks the feed. */
export async function checkForAppUpdate(): Promise<AvailableUpdate | null> {
  if (!isTauriRuntime()) {
    return null
  }
  const { check } = await import('@tauri-apps/plugin-updater')
  const nextUpdate = await check()
  if (downloaded && pendingUpdate) {
    await pendingUpdate.close()
    downloaded = false
  }
  pendingUpdate = nextUpdate
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
export async function installAppUpdate(
  onProgress: (fraction: number) => void,
  mayInstall: () => boolean,
  prepareInstall: () => Promise<void>
): Promise<boolean> {
  if (!pendingUpdate) {
    throw new Error('no pending update')
  }
  let total = 0
  let received = 0
  const update = pendingUpdate
  if (!downloaded) {
    await update.download((event) => {
      if (event.event === 'Started') {
        total = event.data.contentLength ?? 0
      } else if (event.event === 'Progress') {
        received += event.data.chunkLength
        onProgress(total > 0 ? Math.min(1, received / total) : 0)
      } else {
        onProgress(1)
      }
    })
    downloaded = true
  } else {
    onProgress(1)
  }
  const { relaunch } = await import('@tauri-apps/plugin-process')
  // Windows can exit inside install(), so the final guard must run before it.
  if (!mayInstall()) {
    return false
  }
  await prepareInstall()
  if (!mayInstall()) {
    return false
  }
  downloaded = false
  await update.install()
  await relaunch()
  return true
}

export async function confirmUpdateChanges(): Promise<'save' | 'discard' | 'cancel'> {
  if (!isTauriRuntime()) {
    return 'cancel'
  }
  const { message } = await import('@tauri-apps/plugin-dialog')
  const save = t('file.save')
  const discard = t('update.discard')
  const choice = await message(t('update.saveQuestion'), {
    title: t('file.discardTitle'),
    kind: 'warning',
    buttons: { yes: save, no: discard, cancel: t('update.cancel') }
  })
  return choice === save ? 'save' : choice === discard ? 'discard' : 'cancel'
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
