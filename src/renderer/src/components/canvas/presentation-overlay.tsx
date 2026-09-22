import { useLayoutEffect, useRef } from 'react'
import { orderedFrames } from '@shared/canvas/presentation-sequence'
import { mountPresentationExperience } from '@shared/presentation/presentation-experience'
import { t } from '@/i18n/ui-strings'
import { useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'
import { selectLocale, useLanguageStore } from '@/store/language-store'
import { isModalDialogOpen } from '@/store/modal-dialogs'
import { annotationSession } from '@/store/presentation-annotation-store'
import {
  selectPresentationRoll,
  selectSlideShowActive,
  usePresentationStore
} from '@/store/presentation-store'

function presentationLabels() {
  return {
    controls: t('present.start'),
    toggleOverview: `${t('present.overview')} (O)`,
    previous: `${t('present.previous')} (←)`,
    next: `${t('present.next')} (→)`,
    togglePointer: `${t('present.pointer')} (P)`,
    clearInk: `${t('present.clearInk')} (E)`,
    tools: t('help.tools'),
    exit: `${t('present.exit')} (Esc)`
  }
}

export function PresentationOverlay({ allowExit = true }: { allowExit?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const experience = useRef<ReturnType<typeof mountPresentationExperience> | null>(null)
  const active = usePresentationStore(selectSlideShowActive)
  const locale = useLanguageStore(selectLocale)
  const documentSession = useDocumentStore((state) => state.session)
  useLayoutEffect(() => {
    const viewport = ref.current?.parentElement
    if (!active || !viewport) {
      return
    }
    let document = useDocumentStore.getState().document
    let frames = orderedFrames(document)
    const mounted = mountPresentationExperience(
      viewport,
      {
        getState: () => {
          const { index, overview } = usePresentationStore.getState()
          const current = useDocumentStore.getState().document
          if (current !== document) {
            document = current
            frames = orderedFrames(current)
          }
          return {
            index,
            overview,
            count: frames.length,
            frameId: frames[index]?.id ?? null,
            name: frames[index]?.name ?? ''
          }
        },
        getView: () => {
          const { camera, viewport } = useCameraStore.getState()
          return { camera, viewport, roll: selectPresentationRoll(usePresentationStore.getState()) }
        },
        subscribeState: (notify) => {
          const presentation = usePresentationStore.subscribe((state, previous) => {
            if (state.index !== previous.index || state.overview !== previous.overview) {
              notify()
            }
          })
          const document = useDocumentStore.subscribe((state, previous) => {
            if (state.document !== previous.document) {
              notify()
            }
          })
          return () => {
            presentation()
            document()
          }
        },
        subscribeView: (notify) => {
          const camera = useCameraStore.subscribe(notify)
          const roll = usePresentationStore.subscribe((state, previous) => {
            if (state.roll !== previous.roll) {
              notify()
            }
          })
          return () => {
            camera()
            roll()
          }
        },
        next: () => usePresentationStore.getState().next(),
        previous: () => usePresentationStore.getState().previous(),
        toggleOverview: () => usePresentationStore.getState().toggleOverview(),
        exit: allowExit ? () => usePresentationStore.getState().exit() : undefined,
        isInputBlocked: isModalDialogOpen
      },
      presentationLabels(),
      annotationSession
    )
    experience.current = mounted
    return () => {
      mounted.dispose()
      experience.current = null
    }
  }, [active, allowExit, documentSession])
  useLayoutEffect(() => {
    experience.current?.updateLabels(presentationLabels())
  }, [locale])
  return <div ref={ref} />
}
