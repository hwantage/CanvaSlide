import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { createEmptyDocument } from '@shared/canvas/element-types'
import { encodeNativeDocumentFile } from '@/lib/document-file-codec'
import { parseDocument, serializeDocument } from '@shared/canvas/document-file'
import { useDocumentCommands, useWindowTitle } from '@/hooks/use-document-commands'
import { useDocumentStore } from '@/store/document-store'
import { openDocumentAtPath, openDocumentFile, saveDocumentFile } from './document-file-access'
import { onLaunchDocument } from './launch-document'
import type { FilePath } from './file-path'

const { invoke, listen, setTitle } = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  setTitle: vi.fn()
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke }))
vi.mock('@tauri-apps/api/event', () => ({ listen }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ setTitle }) }))
vi.mock('@/lib/document-file-codec', async () => {
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
vi.mock('./tauri-runtime', () => ({ isTauriRuntime: () => true }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: () => true, message: vi.fn() }))

const native: FilePath = {
  encoding: 'unix-bytes',
  bytes: [47, 100, 101, 99, 107, 255, 46, 99, 97, 110, 118, 97, 115, 108, 105, 100, 101],
  display: '/deck�.canvaslide'
}
const windows: FilePath = {
  encoding: 'windows-wide',
  units: [
    67,
    58,
    92,
    100,
    101,
    99,
    107,
    0xd800,
    ...Array.from('.canvaslide', (c) => c.charCodeAt(0))
  ],
  display: 'C:\\deck�.canvaslide'
}
const contents = serializeDocument({ ...createEmptyDocument(), name: '' })

beforeEach(() => {
  vi.clearAllMocks()
  useDocumentStore.getState().newDocument()
  listen.mockResolvedValue(() => {})
  invoke.mockImplementation((command: string, args?: { path?: FilePath }) => {
    if (command === 'read_document') {
      return Promise.resolve(contents)
    }
    if (command === 'write_document') {
      return Promise.resolve(args?.path)
    }
    return Promise.resolve(null)
  })
})

describe('native path transport', () => {
  it.each([native, windows, '/계획 😀.canvaslide', 'unix-bytes:255.canvaslide'])(
    'preserves a path through open, stored state and silent save: %j',
    async (path) => {
      const { result, unmount } = renderHook(() => useDocumentCommands())
      await act(() => result.current.openDocumentPath(path))
      expect(useDocumentStore.getState().filePath).toEqual(path)
      expect(invoke).toHaveBeenCalledWith('read_document', { path })
      await act(() => result.current.saveDocument())
      expect(invoke).toHaveBeenCalledWith('write_document', {
        path,
        contents: expect.any(String)
      })
      expect(invoke).not.toHaveBeenCalledWith('pick_document_save_path', expect.anything())
      expect(useDocumentStore.getState().filePath).toEqual(path)
      unmount()
    }
  )

  it('uses display text for the document name and window title only', async () => {
    const opened = await openDocumentAtPath(native)
    useDocumentStore.getState().loadDocument(opened.document, opened.filePath)
    const { unmount } = renderHook(() => useWindowTitle())
    expect(opened.document.name).toBe('deck�')
    await vi.waitFor(() => expect(setTitle).toHaveBeenCalledWith('deck� — CanvaSlide'))
    expect(invoke).toHaveBeenCalledWith('read_document', { path: native })
    unmount()
  })

  it('takes an encoded launch path through the listener into the store', async () => {
    invoke.mockImplementation((command: string) =>
      Promise.resolve(command === 'take_launch_document' ? native : contents)
    )
    const { result, unmount } = renderHook(() => useDocumentCommands())
    const stop = onLaunchDocument(result.current.openDocumentPath)
    await vi.waitFor(() => expect(useDocumentStore.getState().filePath).toEqual(native))
    expect(invoke).toHaveBeenCalledWith('read_document', { path: native })
    stop()
    unmount()
  })

  it('opens the native dialog selection without string conversion', async () => {
    invoke.mockImplementation((command: string) =>
      Promise.resolve(command === 'pick_document_path' ? native : contents)
    )
    const opened = await openDocumentFile()
    expect(opened?.filePath).toEqual(native)
    expect(invoke).toHaveBeenCalledWith('read_document', { path: native })
  })

  it('retains the returned Save As target for the next silent save', async () => {
    const chosen = {
      ...native,
      bytes: [47, 99, 111, 112, 121, 255, ...new TextEncoder().encode('.canvaslide')],
      display: '/copy�.canvaslide'
    }
    invoke.mockImplementation((command: string, args?: { path?: FilePath }) => {
      if (command === 'pick_document_save_path') {
        return Promise.resolve(chosen)
      }
      if (command === 'write_document') {
        return Promise.resolve(args?.path)
      }
      return Promise.resolve(contents)
    })
    const { result, unmount } = renderHook(() => useDocumentCommands())
    await act(() => result.current.openDocumentPath(native))
    await act(() => result.current.saveDocumentAs())
    expect(invoke).toHaveBeenCalledWith('pick_document_save_path', {
      defaultName: 'deck�.canvaslide'
    })
    expect(invoke).toHaveBeenCalledWith('write_document', {
      path: chosen,
      contents: expect.any(String)
    })
    expect(useDocumentStore.getState().filePath).toEqual(chosen)
    invoke.mockClear()
    await act(() => result.current.saveDocument())
    expect(invoke).toHaveBeenCalledWith('write_document', {
      path: chosen,
      contents: expect.any(String)
    })
    unmount()
  })

  it('opens native JSON without a binary transport wrapper', async () => {
    const document = createEmptyDocument('JSON')
    invoke.mockResolvedValue(serializeDocument(document))
    expect((await openDocumentAtPath(native)).document).toEqual(document)
  })

  it('queues slow saves and uses the completed Save As path for the following save', async () => {
    const document = createEmptyDocument('First snapshot')
    useDocumentStore.getState().loadDocument(document, native)
    let release!: () => void
    vi.mocked(encodeNativeDocumentFile).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(serializeDocument(document))
        })
    )
    invoke.mockImplementation((command: string, args?: { path?: FilePath }) =>
      Promise.resolve(command === 'pick_document_save_path' ? windows : args?.path)
    )
    const { result, unmount } = renderHook(() => useDocumentCommands())
    await act(async () => {
      const first = result.current.saveDocumentAs()
      await vi.waitFor(() => expect(release).toBeTypeOf('function'))
      useDocumentStore.getState().renameDocument('Second snapshot')
      const second = result.current.saveDocument()
      expect(invoke.mock.calls.filter(([command]) => command === 'write_document')).toHaveLength(0)
      release()
      await Promise.all([first, second])
    })
    const writes = invoke.mock.calls
      .filter(([command]) => command === 'write_document')
      .map(([, args]) => args)
    expect(writes.map((args) => args.path)).toEqual([windows, windows])
    const last = parseDocument(writes[1].contents)
    expect(last.ok && last.document.name).toBe('Second snapshot')
    expect(useDocumentStore.getState().dirty).toBe(false)
    unmount()
  })

  it('cancels open and Save As without reading or writing', async () => {
    expect(await openDocumentFile()).toBeNull()
    expect(await saveDocumentFile(createEmptyDocument(), native, true)).toBeNull()
    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      'pick_document_path',
      'pick_document_save_path'
    ])
  })
})
