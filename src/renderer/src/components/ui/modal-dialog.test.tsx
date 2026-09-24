import { fireEvent, render, screen } from '@testing-library/react'
import { ModalDialog } from './modal-dialog'
import { ExampleDialog } from '@/components/panels/example-dialog'
import { RecoveryDialog } from '@/components/panels/recovery-dialog'
import { VideoUrlDialog } from '@/components/panels/video-url-dialog'
import { useExampleStore } from '@/store/example-store'
import { dismissTopModalDialog, isModalDialogOpen, useModalStackStore } from '@/store/modal-stack'
import { useRecoveryStore } from '@/store/recovery-store'

afterEach(() => {
  useExampleStore.setState({ open: false })
  useRecoveryStore.setState({ prompting: false, offers: [], batchRemaining: 0 })
  useModalStackStore.setState({ dialogs: [] })
})

test('a dialog blocks input from mounting until unmounting', () => {
  const view = render(
    <ModalDialog label="Test" onClose={vi.fn()} className="w-8">
      <button>Inside</button>
    </ModalDialog>
  )
  expect(isModalDialogOpen()).toBe(true)
  view.unmount()
  expect(isModalDialogOpen()).toBe(false)
})

test('Escape from outside the dialog calls the onClose of its latest render', () => {
  const first = vi.fn()
  const latest = vi.fn()
  const view = render(
    <ModalDialog label="Test" onClose={first} className="w-8">
      <button>Inside</button>
    </ModalDialog>
  )
  view.rerender(
    <ModalDialog label="Test" onClose={latest} className="w-8">
      <button>Inside</button>
    </ModalDialog>
  )
  dismissTopModalDialog()
  expect(latest).toHaveBeenCalledTimes(1)
  expect(first).not.toHaveBeenCalled()
})

test('the video link and example dialogs, which the old list missed, block input', () => {
  const video = render(<VideoUrlDialog onClose={vi.fn()} />)
  expect(isModalDialogOpen()).toBe(true)
  video.unmount()
  useExampleStore.setState({ open: true })
  const example = render(<ExampleDialog />)
  expect(isModalDialogOpen()).toBe(true)
  example.unmount()
  expect(isModalDialogOpen()).toBe(false)
})

test('the recovery prompt blocks input but neither Escape nor its backdrop answers it', () => {
  useRecoveryStore.setState({
    prompting: true,
    offers: [{ sessionId: 'crashed', quarantined: true, version: null }],
    batchRemaining: 1
  })
  const view = render(<RecoveryDialog />)
  const dialog = screen.getByRole('dialog', { hidden: true })
  dismissTopModalDialog()
  fireEvent(dialog, new Event('cancel', { cancelable: true }))
  fireEvent.click(dialog)
  expect(useRecoveryStore.getState().prompting).toBe(true)
  expect(isModalDialogOpen()).toBe(true)
  // The editor unmounts the prompt during a slide show so presentation keys keep working.
  view.unmount()
  expect(isModalDialogOpen()).toBe(false)
})
