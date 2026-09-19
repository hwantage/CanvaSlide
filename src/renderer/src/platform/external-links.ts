import { t } from '@/i18n/ui-strings'
import { errorText, showErrorMessage } from './document-file-access'
import { isTauriRuntime } from './tauri-runtime'

export const REPOSITORY_URL = 'https://github.com/hwantage/CanvaSlide'

export async function openExternalUrl(url: string): Promise<void> {
  if (isTauriRuntime()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
    return
  }
  window.open(url, '_blank', 'noopener')
}

export async function openRepositoryPage(): Promise<void> {
  try {
    await openExternalUrl(REPOSITORY_URL)
  } catch (error) {
    await showErrorMessage(t('about.repositoryError', { message: errorText(error) }))
  }
}
