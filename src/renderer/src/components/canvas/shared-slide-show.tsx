import { useLayoutEffect, useRef } from 'react'
import type { CanvasDocument } from '@shared/canvas/element-types'
import { useCloseGuard } from '@/hooks/use-close-guard'
import { useWindowTitle } from '@/hooks/use-document-commands'
import { useSystemTheme } from '@/hooks/use-system-theme'
import { measureViewport, useViewportSize } from '@/hooks/use-viewport-size'
import { t } from '@/i18n/ui-strings'
import { preventPageContextMenu } from '@/lib/native-context-menu'
import { useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'
import { selectLocale, useLanguageStore } from '@/store/language-store'
import { usePresentationStore } from '@/store/presentation-store'
import { GridBackground } from './grid-background'
import { PresentationFramePicker } from './presentation-frame-picker'
import { PresentationOverlay } from './presentation-overlay'
import { PresentationStage } from './presentation-stage'
import { SpotlightOverlay } from './spotlight-overlay'
import { WorldLayer } from './world-layer'

// This screen mounts neither the editor's commands nor its pointer, drop, and clipboard handlers.
export function SharedSlideShow({ document }: { document: CanvasDocument }) {
  const ref = useRef<HTMLDivElement>(null)
  const locale = useLanguageStore(selectLocale)
  useViewportSize(ref)
  useWindowTitle()
  useCloseGuard()
  useSystemTheme()

  useLayoutEffect(() => {
    useDocumentStore.getState().loadDocument(document, null)
    if (ref.current) {
      measureViewport(ref.current)
    }
    const presentation = usePresentationStore.getState()
    presentation.start()
    presentation.flyToCurrent()
    return () => {
      usePresentationStore.getState().exit()
      useCameraStore.getState().cancelAnimation()
    }
  }, [document])

  return (
    <main
      lang={locale}
      aria-label={t('share.access.present')}
      data-testid="shared-slide-show"
      className="h-full bg-background text-foreground"
      onContextMenuCapture={preventPageContextMenu}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => event.preventDefault()}
    >
      <div
        ref={ref}
        data-testid="canvas-viewport"
        className="relative h-full overflow-hidden touch-none"
      >
        <GridBackground />
        <PresentationStage>
          <WorldLayer readOnly />
          <SpotlightOverlay />
        </PresentationStage>
        <PresentationFramePicker />
        <PresentationOverlay allowExit={false} />
      </div>
    </main>
  )
}
