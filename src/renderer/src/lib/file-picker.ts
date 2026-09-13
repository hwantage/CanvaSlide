/**
 * Opens the platform file chooser through a transient `<input type="file">`. Works in the browser
 * and inside the Tauri WebView alike, and hands back File objects that the importers already take.
 */
export function pickFiles(accept: string, multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.hidden = true
    input.setAttribute('data-testid', 'file-picker')
    const finish = (files: File[]) => {
      input.remove()
      resolve(files)
    }
    input.addEventListener('change', () => finish([...(input.files ?? [])]))
    // Why: engines that fire `cancel` let us clean up at once; the others are tidied on next use.
    input.addEventListener('cancel', () => finish([]))
    document.body.append(input)
    input.click()
  })
}
