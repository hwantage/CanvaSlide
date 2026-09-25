import { useLayoutEffect, useRef } from 'react'
import type { VideoElement as Video } from '@shared/canvas/element-types'
import { mountLinkedVideo, type VideoLabels } from '@shared/media/linked-video'
import '@shared/media/linked-video.css'
import { currentLocale, t } from '@/i18n/ui-strings'
import { canvasVideoFocus } from '@/lib/interaction/video-expansion'
import { videoPlaybackAccess } from '@/platform/video-playback-access'

export function VideoElement({
  element,
  mode
}: {
  element: Video
  mode: 'editor' | 'passive' | 'manual' | 'auto'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const locale = currentLocale()
  useLayoutEffect(() => {
    const labels: VideoLabels = {
      play: t('video.play'),
      pause: t('video.pause'),
      resume: t('video.resume'),
      expand: t('video.expand'),
      collapse: t('video.collapse'),
      sound: t('video.sound'),
      mute: t('video.mute'),
      loading: t('video.loading'),
      blocked: t('video.blocked'),
      error: t('video.error'),
      retry: t('video.retry'),
      open: t('video.open'),
      thumbnail: t('video.thumbnail', { provider: 'YouTube' }),
      linked: t('video.linked')
    }
    return mountLinkedVideo(ref.current!, {
      url: element.url,
      expand: (onClose, resize) => canvasVideoFocus.open(element.id, onClose, resize),
      labels,
      interactive: mode !== 'passive',
      autoplay: mode === 'auto',
      ...videoPlaybackAccess()
    })
  }, [element.id, element.url, mode, locale])
  return (
    <div
      ref={ref}
      data-element-id={element.id}
      data-element-type="video"
      className="absolute"
      style={{ left: element.x, top: element.y, width: element.width, height: element.height }}
    />
  )
}
