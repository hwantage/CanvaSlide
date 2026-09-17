import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { selectPresentationRoll, usePresentationStore } from '@/store/presentation-store'

/**
 * Rolls the whole world about the viewport centre while presenting. The camera model stays
 * `{x, y, zoom}` — hit testing, snapping and every rect-based feature never see a rotation, because
 * the editor never rolls.
 */
export function PresentationStage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  // Why: roll changes every frame during a flight, so it bypasses React like the camera transform.
  useLayoutEffect(() => {
    const apply = (roll: number) => {
      const node = ref.current
      if (!node) {
        return
      }
      node.style.transform = roll === 0 ? '' : `rotate(${roll}deg)`
      node.style.willChange = roll === 0 ? 'auto' : 'transform'
    }
    apply(selectPresentationRoll(usePresentationStore.getState()))
    return usePresentationStore.subscribe((state, previous) => {
      const roll = selectPresentationRoll(state)
      if (roll !== selectPresentationRoll(previous)) {
        apply(roll)
      }
    })
  }, [])

  return (
    <div
      ref={ref}
      data-testid="presentation-stage"
      className="absolute inset-0"
      style={{ transformOrigin: '50% 50%' }}
    >
      {children}
    </div>
  )
}
