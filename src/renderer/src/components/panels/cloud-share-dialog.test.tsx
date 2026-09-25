import { fireEvent, render, screen } from '@testing-library/react'
import { CloudShareDialog } from './cloud-share-dialog'
import type { DocumentCommands } from '@/hooks/use-document-commands'
import { HOSTED_SHARE_ORIGIN } from '@/platform/cloud-share'
import { HOSTED_SHARE_SERVICE_URL } from '@/platform/external-links'
import { useCloudShareStore } from '@/store/cloud-share-store'

const commands = { saveDocumentAs: vi.fn() } as unknown as DocumentCommands

beforeEach(() => {
  useCloudShareStore.setState({ open: true, mode: 'publish', busy: false, url: null, error: null })
})

afterEach(() => {
  useCloudShareStore.setState({ open: false })
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

test('links the terms of the hosted service when sharing through it', () => {
  vi.stubEnv('VITE_CLOUD_SHARE_URL', HOSTED_SHARE_ORIGIN)
  const open = vi.spyOn(window, 'open').mockReturnValue(null)
  render(<CloudShareDialog commands={commands} />)
  const link = screen.getByRole('link', { name: 'Terms, privacy and limits' })
  expect(link.getAttribute('href')).toBe(HOSTED_SHARE_SERVICE_URL)
  expect(fireEvent.click(link)).toBe(false)
  expect(open).toHaveBeenCalledWith(HOSTED_SHARE_SERVICE_URL, '_blank', 'noopener')
})

test('shows no terms link when another host runs the share service', () => {
  vi.stubEnv('VITE_CLOUD_SHARE_URL', 'https://share.example')
  render(<CloudShareDialog commands={commands} />)
  expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy()
  expect(screen.queryByRole('link')).toBeNull()
})
