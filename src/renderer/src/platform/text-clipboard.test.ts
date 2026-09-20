import { copyText } from './text-clipboard'
import { isTauriRuntime } from './tauri-runtime'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'

vi.mock('./tauri-runtime', () => ({ isTauriRuntime: vi.fn(() => false) }))
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText: vi.fn() }))

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

it('starts the browser clipboard write before yielding the user gesture', async () => {
  vi.mocked(isTauriRuntime).mockReturnValue(false)
  const browser = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  const copying = copyText('prompt')
  expect(browser).toHaveBeenCalledExactlyOnceWith('prompt')
  await copying
})

it.each([false, true])(
  'copies all multiline text and propagates failures (desktop: %s)',
  async (desktop) => {
    vi.mocked(isTauriRuntime).mockReturnValue(desktop)
    const browser = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    const native = vi.mocked(writeText).mockResolvedValue()
    const target = desktop ? native : browser
    const other = desktop ? browser : native
    const text = 'AI와 함께\n\n{"version":2}\n'
    await copyText(text)
    expect(target).toHaveBeenCalledExactlyOnceWith(text)
    expect(other).not.toHaveBeenCalled()
    target.mockRejectedValue(new Error('denied'))
    await expect(copyText(text)).rejects.toThrow('denied')
  }
)
