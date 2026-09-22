import { useEffect, useLayoutEffect, useRef } from 'react'
import type { CanvasDocument } from '@shared/canvas/element-types'
import { presentationKeyAction } from '@shared/canvas/presentation-keys'
import { useCloseGuard } from '@/hooks/use-close-guard'
import { useWindowTitle } from '@/hooks/use-document-commands'
import { useSystemTheme } from '@/hooks/use-system-theme'
import { measureViewport, useViewportSize } from '@/hooks/use-viewport-size'
import { t } from '@/i18n/ui-strings'
import { preventPageContextMenu } from '@/lib/native-context-menu'
import { hasPrimaryModifier } from '@/lib/platform-keys'
import { useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'
import { selectLocale, useLanguageStore } from '@/store/language-store'
import {
  selectAnnotationCursor,
  usePresentationAnnotationStore
} from '@/store/presentation-annotation-store'
import { usePresentationStore } from '@/store/presentation-store'
import { GridBackground } from './grid-background'
import { LaserPointerOverlay } from './laser-pointer-overlay'
import { PresentationFramePicker } from './presentation-frame-picker'
import { PresentationInkOverlay } from './presentation-ink-overlay'
import { PresentationOverlay } from './presentation-overlay'
import { PresentationStage } from './presentation-stage'
import { SpotlightOverlay } from './spotlight-overlay'
import { WorldLayer } from './world-layer'

// This screen mounts neither the editor's commands nor its pointer, drop, and clipboard handlers.
export function SharedSlideShow({ document }: { document: CanvasDocument }) {
  const ref = useRef<HTMLDivElement>(null)
  const locale = useLanguageStore(selectLocale)
  const annotationCursor = usePresentationAnnotationStore(selectAnnotationCursor)
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || hasPrimaryModifier(event) || event.altKey) {
        return
      }
      // Let focused navigation buttons handle their own keyboard activation exactly once.
      if (
        (event.key === ' ' || event.key === 'Enter') &&
        event.target instanceof Element &&
        event.target.closest('button')
      ) {
        return
      }
      const presentation = usePresentationStore.getState()
      const annotation = usePresentationAnnotationStore.getState()
      switch (presentationKeyAction(event.key)) {
        case 'next':
          presentation.next()
          break
        case 'previous':
          presentation.previous()
          break
        case 'toggleOverview':
          presentation.toggleOverview()
          break
        case 'escape':
          if (presentation.overview) {
            presentation.goTo(presentation.index)
          }
          break
        case 'togglePointer':
          annotation.togglePointer()
          break
        case 'clearInk':
          annotation.clearInk()
          break
        case null:
          return
      }
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

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
        style={{ cursor: annotationCursor }}
      >
        <GridBackground />
        <PresentationStage>
          <WorldLayer readOnly />
          <SpotlightOverlay />
          <PresentationInkOverlay />
        </PresentationStage>
        <PresentationFramePicker />
        <PresentationOverlay allowExit={false} />
        {/* Last, so the dot paints over the control bar: while pointing it is the cursor there too. */}
        <LaserPointerOverlay />
      </div>
    </main>
  )
}
