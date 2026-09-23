import { isModalDialogOpen } from './modal-dialogs'
import { usePresentationStore } from './presentation-store'
import { useRecoveryStore } from './recovery-store'

describe('isModalDialogOpen', () => {
  afterEach(() => {
    useRecoveryStore.setState({ prompting: false })
    usePresentationStore.setState({ active: false, previewFrameId: null })
  })

  it('treats the recovery prompt as a modal in the editor', () => {
    useRecoveryStore.setState({ prompting: true })
    expect(isModalDialogOpen()).toBe(true)
  })

  it('lets a slide show keep its keys while the hidden recovery prompt waits for it to end', () => {
    usePresentationStore.setState({ active: true, previewFrameId: null })
    useRecoveryStore.setState({ prompting: true })
    expect(isModalDialogOpen()).toBe(false)
  })
})
