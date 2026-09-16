import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { createEmptyDocument } from '@shared/canvas/element-types'
import { serializeDocument } from '@shared/canvas/document-file'
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
        contents: expect.any(String),
        normalizeExtension: false
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
      bytes: [47, 99, 111, 112, 121, 255, ...new TextEncoder().encode('.json')],
      display: '/copy�.json'
    }
    const written = {
      ...native,
      bytes: [47, 99, 111, 112, 121, 255, ...new TextEncoder().encode('.canvaslide')],
      display: '/copy�.canvaslide'
    }
    invoke.mockImplementation((command: string) => {
      if (command === 'pick_document_save_path') {
        return Promise.resolve(chosen)
      }
      if (command === 'write_document') {
        return Promise.resolve(written)
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
      contents: expect.any(String),
      normalizeExtension: true
    })
    expect(useDocumentStore.getState().filePath).toEqual(written)
    invoke.mockClear()
    await act(() => result.current.saveDocument())
    expect(invoke).toHaveBeenCalledWith('write_document', {
      path: written,
      contents: expect.any(String),
      normalizeExtension: false
    })
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
