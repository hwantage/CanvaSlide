import type { InvokeArgs, InvokeOptions } from '@tauri-apps/api/core'
import { t, type UiStringKey } from '@/i18n/ui-strings'

/** One entry per code in `src-tauri/src/command_error.rs`. */
const MESSAGES: Readonly<Record<string, UiStringKey>> = {
  invalid_path: 'nativeError.invalidPath',
  not_granted: 'nativeError.notGranted',
  not_a_document: 'nativeError.notADocument',
  invalid_document: 'nativeError.invalidDocument',
  invalid_export: 'nativeError.invalidExport',
  too_large: 'nativeError.tooLarge',
  not_found: 'nativeError.notFound',
  permission_denied: 'nativeError.permissionDenied',
  storage_full: 'nativeError.storageFull',
  io: 'nativeError.io',
  task_failed: 'nativeError.taskFailed',
  recovery_session: 'nativeError.recoverySession',
  recovery_too_large: 'nativeError.recoveryTooLarge',
  recovery_unavailable: 'nativeError.recoveryUnavailable',
  recovery_invalid: 'nativeError.recoveryInvalid',
  video_host_unavailable: 'nativeError.videoHostUnavailable'
}

/** A native command's failure: `code` for branching, a localized `message`, the shell's `detail`. */
export class NativeCommandError extends Error {
  constructor(
    readonly code: string,
    readonly detail: string
  ) {
    const key = Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : undefined
    // Why the detail too: it names the path or OS reason the localized sentence cannot know.
    super(key ? [t(key), detail].filter(Boolean).join('\n\n') : detail || code)
    this.name = 'NativeCommandError'
  }
}

function isCodedError(value: unknown): value is { code: string; detail: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof value.code === 'string' &&
    'detail' in value &&
    typeof value.detail === 'string'
  )
}

/** Invokes a Tauri command whose failure the shell reports as `{ code, detail }`. */
export async function invokeCommand<T>(
  ...call: [command: string, args?: InvokeArgs, options?: InvokeOptions]
): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  try {
    return await invoke<T>(...call)
  } catch (error) {
    throw isCodedError(error) ? new NativeCommandError(error.code, error.detail) : error
  }
}
