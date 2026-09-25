import { act, cleanup, renderHook } from '@testing-library/react'
import { createEmptyDocument, defaultTextStyle } from '@shared/canvas/element-types'
import {
  confirmDiscardChanges,
  openDocumentFile,
  type OpenedDocument
} from '@/platform/document-file-access'
import { useDocumentStore } from '@/store/document-store'
import { useDocumentCommands } from './use-document-commands'

vi.mock('@/platform/document-file-access', () => ({
  confirmDiscardChanges: vi.fn(async () => true),
  openDocumentFile: vi.fn(),
  openDocumentAtPath: vi.fn(),
  reportError: vi.fn(),
  saveDocumentFile: vi.fn()
}))
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(confirmDiscardChanges).mockResolvedValue(true)
  useDocumentStore.getState().loadDocument(createEmptyDocument(), null)
})
afterEach(cleanup)

it.each(['confirmation', 'read'])(
  'opens the chosen file after text measurement during %s',
  async (phase) => {
    const document = createEmptyDocument('Current')
    document.order = ['text']
    document.elements.text = {
      id: 'text',
      type: 'text',
      text: 'Hello',
      x: 0,
      y: 0,
      width: 100,
      height: 10,
      textStyle: defaultTextStyle
    }
    const store = useDocumentStore.getState()
    store.loadDocument(document, null)
    if (phase === 'confirmation') {
      store.renameDocument('Unsaved')
    }
    let answer!: (allow: boolean) => void
    let finish!: (opened: OpenedDocument) => void
    vi.mocked(confirmDiscardChanges).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve
        })
    )
    vi.mocked(openDocumentFile).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const { result } = renderHook(useDocumentCommands)
    const opening = result.current.openDocument()
    const before = useDocumentStore.getState()
    act(() => store.syncTextHeight('text', 200))
    expect(useDocumentStore.getState().document).not.toBe(before.document)
    expect(useDocumentStore.getState().dirty).toBe(before.dirty)
    if (phase === 'confirmation') {
      await act(async () => {
        answer(true)
      })
    }
    expect(openDocumentFile).toHaveBeenCalledTimes(1)
    await act(async () => {
      finish({ document: createEmptyDocument('Chosen'), filePath: null })
      await opening
    })
    expect(useDocumentStore.getState().document.name).toBe('Chosen')
    expect(useDocumentStore.getState().dirty).toBe(false)
  }
)

it.each(['typing', 'drag'])(
  'preserves ongoing %s in an already dirty document while Open is reading',
  async (change) => {
    const store = useDocumentStore.getState()
    store.insertElement({
      id: 'text',
      type: 'text',
      text: 'Hello',
      x: 0,
      y: 0,
      width: 100,
      height: 10,
      textStyle: defaultTextStyle
    })
    let finish!: (opened: OpenedDocument) => void
    vi.mocked(openDocumentFile).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const { result } = renderHook(useDocumentCommands)
    let opening!: Promise<void>
    await act(async () => {
      opening = result.current.openDocument()
    })
    expect(openDocumentFile).toHaveBeenCalledTimes(1)
    act(() => {
      store.beginEdit()
      store.patchElements(['text'], { text: 'First input', x: 10 }, false)
    })
    const before = useDocumentStore.getState()
    act(() =>
      store.patchElements(
        ['text'],
        change === 'typing' ? { text: 'Later input' } : { x: 20 },
        false
      )
    )
    const current = useDocumentStore.getState()
    expect(current.dirty).toBe(true)
    expect(current.past).toBe(before.past)
    expect(current.future).toBe(before.future)
    await act(async () => {
      finish({ document: createEmptyDocument('Other'), filePath: null })
      await opening
    })
    expect(useDocumentStore.getState().document).toBe(current.document)
  }
)

it.each(['clean', 'unsaved'])(
  'neither asks nor opens while an edit gesture is in progress in %s work',
  async (state) => {
    const store = useDocumentStore.getState()
    if (state === 'unsaved') {
      store.renameDocument('Unsaved')
    }
    store.beginEdit()
    const current = useDocumentStore.getState().document
    const { result } = renderHook(useDocumentCommands)
    await act(() => result.current.openDocument())
    await act(() => result.current.newDocument())
    expect(confirmDiscardChanges).not.toHaveBeenCalled()
    expect(openDocumentFile).not.toHaveBeenCalled()
    expect(useDocumentStore.getState().document).toBe(current)
  }
)

it.each(['restore', 'edit', 'edit then undo'])(
  'cancels a pending Open after %s without replacing current work',
  async (change) => {
    let finish!: (opened: OpenedDocument) => void
    vi.mocked(openDocumentFile).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    const { result } = renderHook(useDocumentCommands)
    let opening!: Promise<void>
    act(() => {
      opening = result.current.openDocument()
    })
    act(() => {
      const store = useDocumentStore.getState()
      if (change === 'restore') {
        store.restoreDocument(createEmptyDocument('Recovered'), null)
      } else {
        store.renameDocument('New work')
        if (change === 'edit then undo') {
          store.undo()
        }
      }
    })
    const current = useDocumentStore.getState().document
    await act(async () => {
      finish({ document: createEmptyDocument('Other'), filePath: null })
      await opening
    })
    expect(useDocumentStore.getState().document).toBe(current)
    expect(confirmDiscardChanges).not.toHaveBeenCalled()
  }
)

it('does not start a read after the discard confirmation became stale', async () => {
  useDocumentStore.getState().renameDocument('Unsaved')
  let answer!: (accept: boolean) => void
  vi.mocked(confirmDiscardChanges).mockReturnValueOnce(
    new Promise((resolve) => {
      answer = resolve
    })
  )
  const { result } = renderHook(useDocumentCommands)
  const opening = result.current.openDocument()
  useDocumentStore.getState().restoreDocument(createEmptyDocument('Recovered'), null)
  await act(async () => {
    answer(true)
    await opening
  })
  expect(openDocumentFile).not.toHaveBeenCalled()
  expect(useDocumentStore.getState().document.name).toBe('Recovered')
})
