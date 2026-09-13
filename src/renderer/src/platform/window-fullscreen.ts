import { isTauriRuntime } from './tauri-runtime'

/** Presentation mode goes fullscreen in the desktop app; a no-op in the browser. */
export async function setWindowFullscreen(fullscreen: boolean): Promise<void> {
  if (!isTauriRuntime()) {
    return
  }
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().setFullscreen(fullscreen)
  } catch {
    // Why: fullscreen is a nicety; never block the presentation on a window API failure.
  }
}
