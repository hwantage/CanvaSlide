import {
  dismissTopModalDialog,
  isModalDialogOpen,
  pushModalDialog,
  useModalStackStore
} from './modal-stack'

afterEach(() => {
  useModalStackStore.setState({ dialogs: [] })
})

test('reports a modal only while one is registered', () => {
  expect(isModalDialogOpen()).toBe(false)
  const remove = pushModalDialog({ dismiss: vi.fn() })
  expect(isModalDialogOpen()).toBe(true)
  remove()
  expect(isModalDialogOpen()).toBe(false)
})

test('Escape dismisses only the dialog on top', () => {
  const below = vi.fn()
  const top = vi.fn()
  pushModalDialog({ dismiss: below })
  const removeTop = pushModalDialog({ dismiss: top })
  dismissTopModalDialog()
  expect(top).toHaveBeenCalledTimes(1)
  expect(below).not.toHaveBeenCalled()
  removeTop()
  dismissTopModalDialog()
  expect(below).toHaveBeenCalledTimes(1)
})

test('a dialog below can close first without disturbing the one on top', () => {
  const below = vi.fn()
  const top = vi.fn()
  const removeBelow = pushModalDialog({ dismiss: below })
  pushModalDialog({ dismiss: top })
  removeBelow()
  expect(isModalDialogOpen()).toBe(true)
  dismissTopModalDialog()
  expect(top).toHaveBeenCalledTimes(1)
  expect(below).not.toHaveBeenCalled()
})

test('removing twice leaves the other dialogs registered', () => {
  const remove = pushModalDialog({ dismiss: vi.fn() })
  pushModalDialog({ dismiss: vi.fn() })
  remove()
  remove()
  expect(useModalStackStore.getState().dialogs).toHaveLength(1)
})

test('Escape with no dialog open does nothing', () => {
  expect(() => dismissTopModalDialog()).not.toThrow()
})
