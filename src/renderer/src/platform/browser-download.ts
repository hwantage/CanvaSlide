/** Browser fallback for "save": hands the contents to the download manager under `fileName`. */
export function downloadFile(
  contents: string | Uint8Array<ArrayBuffer>,
  fileName: string,
  mime: string
): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  // Why: revoking synchronously can cancel the download in some engines; a second is plenty.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
