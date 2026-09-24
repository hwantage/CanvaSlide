import { readFileSync } from 'node:fs'
import { invoke } from '@tauri-apps/api/core'
import { setLocale, t } from '@/i18n/ui-strings'
import { invokeCommand, NativeCommandError } from './native-command'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

afterEach(() => setLocale('en'))

describe('native command errors', () => {
  it('turns a coded rejection into a localized error that keeps its code and detail', async () => {
    vi.mocked(invoke).mockRejectedValue({ code: 'not_found', detail: '/tmp/deck.canvaslide' })
    setLocale('ko')
    const error = await invokeCommand('read_document', { path: '/tmp/deck.canvaslide' }).catch(
      (thrown: unknown) => thrown
    )
    expect(error).toBeInstanceOf(NativeCommandError)
    expect(error).toMatchObject({
      code: 'not_found',
      detail: '/tmp/deck.canvaslide',
      message: `${t('nativeError.notFound')}\n\n/tmp/deck.canvaslide`
    })
    setLocale('en')
    expect((error as Error).message).not.toContain(t('nativeError.notFound'))
  })

  it('shows only the localized sentence when the shell has no detail', () => {
    expect(new NativeCommandError('too_large', '').message).toBe(t('nativeError.tooLarge'))
  })

  it('falls back to the detail for a code it does not know, never to an object', () => {
    expect(new NativeCommandError('from_a_newer_shell', 'disk on fire').message).toBe(
      'disk on fire'
    )
    expect(new NativeCommandError('toString', '').message).toBe('toString')
  })

  it('passes other rejections and results through unchanged', async () => {
    vi.mocked(invoke).mockRejectedValueOnce('plugin error')
    await expect(invokeCommand('pick_document_path')).rejects.toBe('plugin error')
    vi.mocked(invoke).mockResolvedValueOnce(['a'])
    await expect(invokeCommand('list_recovery_sessions')).resolves.toEqual(['a'])
    expect(invoke).toHaveBeenLastCalledWith('list_recovery_sessions')
  })

  it('has a message for every code the shell can return', () => {
    const source = readFileSync('src-tauri/src/command_error.rs', 'utf8')
    const list = /pub const CODES: &\[&str\] = &\[([^\]]*)\]/.exec(source)?.[1] ?? ''
    const codes = [...list.matchAll(/"(\w+)"/g)].map(([, code]) => code ?? '')
    expect(codes.length).toBeGreaterThan(10)
    for (const code of codes) {
      const { message } = new NativeCommandError(code, '')
      expect(message, code).not.toBe(code)
    }
  })
})
