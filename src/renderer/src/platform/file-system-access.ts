/**
 * File System Access API: the browser pickers that hand out file handles, and the reads and writes
 * through them. Chromium-based browsers have it; Safari and Firefox lack the pickers, so callers
 * fall back to a file input and downloads there. A handle is session state of the page: it never
 * enters a document, recovery copy, share or export.
 */

/** One entry of a picker's file-type filter: a MIME type and the extensions shown for it. */
export type FilePickerType = { description: string; accept: Record<string, string[]> }

type OpenPickerOptions = { multiple?: boolean; types?: FilePickerType[] }
type SavePickerOptions = { suggestedName?: string; types?: FilePickerType[] }
type FilePickers = {
  showOpenFilePicker: (options?: OpenPickerOptions) => Promise<FileSystemFileHandle[]>
  showSaveFilePicker: (options?: SavePickerOptions) => Promise<FileSystemFileHandle>
}

/** The pickers, when this engine exposes them; the lib.dom types do not declare them. */
function filePickers(): FilePickers | null {
  const candidate = window as Partial<Record<keyof FilePickers, unknown>>
  return typeof candidate.showOpenFilePicker === 'function' &&
    typeof candidate.showSaveFilePicker === 'function'
    ? (window as unknown as FilePickers)
    : null
}

export function supportsFileSystemAccess(): boolean {
  return filePickers() !== null
}

/** A dismissed picker is a decision, not a failure. */
function isPickerCancel(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** Lets the user pick one existing file; null when the picker was dismissed. */
export async function pickFileHandle(
  types: FilePickerType[]
): Promise<FileSystemFileHandle | null> {
  const pickers = filePickers()
  if (!pickers) {
    throw new Error('The File System Access API is not available')
  }
  try {
    const [handle] = await pickers.showOpenFilePicker({ multiple: false, types })
    return handle ?? null
  } catch (error) {
    if (isPickerCancel(error)) {
      return null
    }
    throw error
  }
}

/** Lets the user choose where to write; null when the picker was dismissed. */
export async function pickSaveFileHandle(
  suggestedName: string,
  types: FilePickerType[]
): Promise<FileSystemFileHandle | null> {
  const pickers = filePickers()
  if (!pickers) {
    throw new Error('The File System Access API is not available')
  }
  try {
    return await pickers.showSaveFilePicker({ suggestedName, types })
  } catch (error) {
    if (isPickerCancel(error)) {
      return null
    }
    throw error
  }
}

export async function readFileHandle(
  handle: FileSystemFileHandle
): Promise<Uint8Array<ArrayBuffer>> {
  const file = await handle.getFile()
  return new Uint8Array(await file.arrayBuffer())
}

/**
 * Replaces the file's contents. The browser writes to a swap file and moves it over the target on
 * `close()`, so a failed or aborted write leaves the previous contents in place.
 */
export async function writeFileHandle(
  handle: FileSystemFileHandle,
  contents: Uint8Array<ArrayBuffer>
): Promise<void> {
  const writable = await handle.createWritable()
  try {
    await writable.write(contents)
  } catch (error) {
    await writable.abort().catch(() => {})
    throw error
  }
  await writable.close()
}
