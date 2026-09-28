import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { createEmptyDocument } from '@shared/canvas/element-types'
import { parseDocument, serializeDocument } from '@shared/canvas/document-file'
import { useDocumentCommands } from '@/hooks/use-document-commands'
import { useDocumentStore } from '@/store/document-store'
import { downloadFile } from './browser-download'
import { openDocumentFile, saveDocumentFile } from './document-file-access'

vi.mock('./tauri-runtime', () => ({ isTauriRuntime: () => false }))
vi.mock('./browser-download', () => ({ downloadFile: vi.fn() }))
vi.mock('@/lib/workers/document-file-codec', async () => {
  const codec = await import('@shared/canvas/document-file')
  return {
    encodeDocumentFile: vi.fn((document) =>
      new TextEncoder().encode(codec.serializeDocument(document))
    ),
    decodeDocumentFile: codec.parseDocumentFile,
    encodeNativeDocumentFile: vi.fn(codec.serializeDocument),
    decodeNativeDocumentFile: codec.parseDocument
  }
})

type FakeHandle = FileSystemFileHandle & { writes: string[]; aborted: number }

/** A handle over in-memory text whose writes commit on `close()`, as the browser's swap file does. */
function fakeHandle(name: string, contents: string, failWrite = false): FakeHandle {
  const handle = {
    kind: 'file',
    name,
    writes: [] as string[],
    aborted: 0,
    getFile: () => Promise.resolve(new File([contents], name)),
    createWritable: () => {
      const chunks: Uint8Array[] = []
      return Promise.resolve({
        write: (chunk: Uint8Array) => {
          if (failWrite) {
            return Promise.reject(new Error('disk full'))
          }
          chunks.push(chunk)
          return Promise.resolve()
        },
        close: () => {
          handle.writes.push(chunks.map((chunk) => new TextDecoder().decode(chunk)).join(''))
          return Promise.resolve()
        },
        abort: () => {
          handle.aborted += 1
          return Promise.resolve()
        }
      })
    }
  }
  return handle as unknown as FakeHandle
}

const pickers = { showOpenFilePicker: vi.fn(), showSaveFilePicker: vi.fn() }
/** happy-dom has no dialogs; the browser paths report through `alert` and ask through `confirm`. */
const dialogs = { alert: vi.fn(), confirm: vi.fn(() => true) }
const cancelled = () =>
  Promise.reject(new DOMException('The user aborted a request.', 'AbortError'))
const unnamed = serializeDocument({ ...createEmptyDocument(), name: '' })

function installPickers(): void {
  for (const [name, value] of Object.entries({ ...pickers, ...dialogs })) {
    Object.defineProperty(window, name, { value, configurable: true, writable: true })
  }
}

function removePickers(): void {
  for (const name of Object.keys(pickers)) {
    Object.defineProperty(window, name, { value: undefined, configurable: true, writable: true })
  }
}

function lastWrite(handle: FakeHandle) {
  const parsed = parseDocument(handle.writes.at(-1) ?? '')
  return parsed.ok ? parsed.document : null
}

beforeEach(() => {
  vi.clearAllMocks()
  installPickers()
  dialogs.confirm.mockReturnValue(true)
  useDocumentStore.getState().loadDocument(createEmptyDocument(), null)
})

afterEach(() => {
  removePickers()
  vi.restoreAllMocks()
})

describe('browser File System Access', () => {
  it('names an unnamed document after the opened file and saves back to its handle', async () => {
    const deck = fakeHandle('deck.canvaslide', unnamed)
    pickers.showOpenFilePicker.mockResolvedValue([deck])
    const { result, unmount } = renderHook(() => useDocumentCommands())
    await act(() => result.current.openDocument())
    const store = useDocumentStore.getState()
    expect(store.document.name).toBe('deck')
    expect(store.fileHandle).toBe(deck)
    expect(store.filePath).toBeNull()
    expect(pickers.showOpenFilePicker).toHaveBeenCalledWith({
      multiple: false,
      types: [
        {
          description: 'CanvaSlide document',
          accept: { 'application/json': ['.canvaslide', '.json'] }
        }
      ]
    })

    act(() => useDocumentStore.getState().renameDocument('Edited deck'))
    expect(useDocumentStore.getState().dirty).toBe(true)
    await act(() => result.current.saveDocument())
    expect(lastWrite(deck)?.name).toBe('Edited deck')
    expect(pickers.showSaveFilePicker).not.toHaveBeenCalled()
    expect(downloadFile).not.toHaveBeenCalled()
    expect(useDocumentStore.getState()).toMatchObject({ dirty: false, fileHandle: deck })
    unmount()
  })

  it('Save As adopts the picked handle for the saves that follow', async () => {
    const deck = fakeHandle('deck.canvaslide', unnamed)
    const copy = fakeHandle('copy.canvaslide', '')
    pickers.showOpenFilePicker.mockResolvedValue([deck])
    pickers.showSaveFilePicker.mockResolvedValue(copy)
    const { result, unmount } = renderHook(() => useDocumentCommands())
    await act(() => result.current.openDocument())
    await act(() => result.current.saveDocumentAs())
    expect(pickers.showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'deck.canvaslide' })
    )
    expect(copy.writes).toHaveLength(1)
    expect(useDocumentStore.getState().fileHandle).toBe(copy)

    act(() => useDocumentStore.getState().renameDocument('Second'))
    await act(() => result.current.saveDocument())
    expect(copy.writes).toHaveLength(2)
    expect(lastWrite(copy)?.name).toBe('Second')
    expect(deck.writes).toHaveLength(0)
    expect(pickers.showSaveFilePicker).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('a document without a handle asks where to save, and a new document drops the handle', async () => {
    const deck = fakeHandle('deck.canvaslide', unnamed)
    const fresh = fakeHandle('fresh.canvaslide', '')
    pickers.showOpenFilePicker.mockResolvedValue([deck])
    pickers.showSaveFilePicker.mockResolvedValue(fresh)
    const { result, unmount } = renderHook(() => useDocumentCommands())
    await act(() => result.current.openDocument())
    await act(() => result.current.newDocument())
    expect(useDocumentStore.getState().fileHandle).toBeNull()
    await act(() => result.current.saveDocument())
    expect(pickers.showSaveFilePicker).toHaveBeenCalledTimes(1)
    expect(fresh.writes).toHaveLength(1)
    expect(deck.writes).toHaveLength(0)
    expect(useDocumentStore.getState().fileHandle).toBe(fresh)
    unmount()
  })

  it('dismissed pickers change nothing', async () => {
    const deck = fakeHandle('deck.canvaslide', unnamed)
    pickers.showOpenFilePicker.mockResolvedValue([deck])
    const { result, unmount } = renderHook(() => useDocumentCommands())
    await act(() => result.current.openDocument())
    act(() => useDocumentStore.getState().renameDocument('Unsaved'))
    const before = useDocumentStore.getState()

    pickers.showOpenFilePicker.mockImplementation(cancelled)
    pickers.showSaveFilePicker.mockImplementation(cancelled)
    expect(await openDocumentFile()).toBeNull()
    await act(() => result.current.saveDocumentAs())
    expect(useDocumentStore.getState()).toBe(before)
    expect(deck.writes).toHaveLength(0)
    expect(dialogs.alert).not.toHaveBeenCalled()
    unmount()
  })

  it('a failed write reports the error and keeps the previous handle and dirty state', async () => {
    const deck = fakeHandle('deck.canvaslide', unnamed)
    const broken = fakeHandle('broken.canvaslide', '', true)
    pickers.showOpenFilePicker.mockResolvedValue([deck])
    pickers.showSaveFilePicker.mockResolvedValue(broken)
    const { result, unmount } = renderHook(() => useDocumentCommands())
    await act(() => result.current.openDocument())
    act(() => useDocumentStore.getState().renameDocument('Unsaved'))
    await act(() => result.current.saveDocumentAs())
    expect(dialogs.alert).toHaveBeenCalledWith('disk full')
    expect(broken.aborted).toBe(1)
    expect(broken.writes).toHaveLength(0)
    expect(useDocumentStore.getState()).toMatchObject({ dirty: true, fileHandle: deck })
    await act(() => result.current.saveDocument())
    expect(lastWrite(deck)?.name).toBe('Unsaved')
    unmount()
  })

  it('an unreadable pick leaves the open document and its handle in place', async () => {
    const deck = fakeHandle('deck.canvaslide', unnamed)
    const invalid = fakeHandle('notes.canvaslide', '{"version":1}')
    pickers.showOpenFilePicker.mockResolvedValueOnce([deck]).mockResolvedValueOnce([invalid])
    const { result, unmount } = renderHook(() => useDocumentCommands())
    await act(() => result.current.openDocument())
    await act(() => result.current.openDocument())
    expect(dialogs.alert).toHaveBeenCalledWith(expect.stringContaining('Invalid document'))
    expect(useDocumentStore.getState().fileHandle).toBe(deck)
    await act(() => result.current.saveDocument())
    expect(deck.writes).toHaveLength(1)
    expect(invalid.writes).toHaveLength(0)
    unmount()
  })

  it('without the pickers, open reads a file input and save downloads a copy', async () => {
    removePickers()
    const picked = new File([unnamed], 'input.canvaslide')
    const click = vi
      .spyOn(HTMLInputElement.prototype, 'click')
      .mockImplementation(function (this: HTMLInputElement) {
        Object.defineProperty(this, 'files', { value: [picked] })
        void this.onchange?.(new Event('change'))
      })
    const opened = await openDocumentFile()
    expect(click).toHaveBeenCalledTimes(1)
    expect(opened).toMatchObject({ filePath: null, document: { name: 'input' } })
    expect(opened?.fileHandle).toBeUndefined()

    const document = createEmptyDocument('Fallback')
    expect(await saveDocumentFile(document, { filePath: null }, false)).toEqual({ filePath: null })
    expect(downloadFile).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      'Fallback.canvaslide',
      'application/json'
    )
    expect(pickers.showSaveFilePicker).not.toHaveBeenCalled()
  })
})
