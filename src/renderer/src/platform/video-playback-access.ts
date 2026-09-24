import { invoke, isTauri } from '@tauri-apps/api/core'
import type { VideoOptions } from '@shared/media/linked-video'
import { t } from '@/i18n/ui-strings'
import { reportError } from './document-file-access'

export function videoPlaybackAccess(): Pick<
  VideoOptions,
  'embedOrigin' | 'httpsOnlyHint' | 'openOriginal'
> {
  return {
    // The desktop policy admits no plain HTTP media, so say why instead of failing generically.
    ...(isTauri()
      ? {
          embedOrigin: () => invoke<string>('video_embed_origin'),
          httpsOnlyHint: t('video.httpsOnly')
        }
      : {}),
    openOriginal: (url) => {
      if (isTauri()) {
        void import('@tauri-apps/plugin-opener')
          .then(({ openUrl }) => openUrl(url))
          .catch(reportError)
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    }
  }
}
