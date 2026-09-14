import { isTauriRuntime } from './tauri-runtime'

/**
 * Reads the OS clipboard through the Rust side. Why: WKWebView (and WebView2 without a focused
 * editable) may never dispatch a DOM `paste` event or hands it over with its data withheld, so
 * ⌘V after a screenshot would otherwise do nothing in the desktop app.
 */
export async function readNativeClipboardImage(): Promise<File | null> {
  if (!isTauriRuntime()) {
    return null
  }
  try {
    const { readImage } = await import('@tauri-apps/plugin-clipboard-manager')
    const image = await readImage()
    const { width, height } = await image.size()
    const rgba = await image.rgba()
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context || width === 0 || height === 0) {
      return null
    }
    context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    return blob ? new File([blob], 'clipboard.png', { type: 'image/png' }) : null
  } catch {
    // Why: the plugin rejects when the clipboard holds no image; that is the common case.
    return null
  }
}

export async function readNativeClipboardText(): Promise<string> {
  if (!isTauriRuntime()) {
    return ''
  }
  try {
    const { readText } = await import('@tauri-apps/plugin-clipboard-manager')
    return (await readText()) ?? ''
  } catch {
    return ''
  }
}
