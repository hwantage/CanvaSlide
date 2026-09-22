import { Eraser, Pen } from 'lucide-react'
import { IconButton } from '@/components/ui/icon-button'
import { useCompactLayout } from '@/hooks/use-compact-layout'
import { t } from '@/i18n/ui-strings'
import {
  selectPointing,
  usePresentationAnnotationStore
} from '@/store/presentation-annotation-store'

/** The pointer and eraser buttons of the presentation control bar. */
export function PresentationAnnotationControls() {
  const compact = useCompactLayout()
  const pointing = usePresentationAnnotationStore(selectPointing)
  const togglePointer = usePresentationAnnotationStore((s) => s.togglePointer)
  const clearInk = usePresentationAnnotationStore((s) => s.clearInk)
  // Why: the compact bar already spans a phone screen, and more 44px targets push it off.
  if (compact) {
    return null
  }
  return (
    <>
      <IconButton
        label={`${t('present.pointer')} (P)`}
        active={pointing}
        onClick={togglePointer}
        data-testid="pointer-toggle"
      >
        <Pen size={16} />
      </IconButton>
      <IconButton label={`${t('present.clearInk')} (E)`} onClick={clearInk} data-testid="ink-clear">
        <Eraser size={16} />
      </IconButton>
    </>
  )
}
