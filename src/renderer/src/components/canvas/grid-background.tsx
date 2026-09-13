import { selectCamera, useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'
import { selectPresentationActive, usePresentationStore } from '@/store/presentation-store'

const BASE_STEP = 40

/** Picks a grid step whose on-screen spacing stays between 20px and 80px at any zoom. */
export function gridStepForZoom(zoom: number): number {
  let step = BASE_STEP
  while (step * zoom < 20) {
    step *= 2
  }
  while (step * zoom > 80) {
    step /= 2
  }
  return step
}

export function GridBackground() {
  const camera = useCameraStore(selectCamera)
  const presenting = usePresentationStore(selectPresentationActive)
  const background = useDocumentStore((s) => s.document.settings.background)
  const spacing = gridStepForZoom(camera.zoom) * camera.zoom
  if (presenting || background === 'plain') {
    return (
      <div
        aria-hidden
        data-testid="canvas-background"
        data-background={presenting ? 'plain' : background}
        className="pointer-events-none absolute inset-0 bg-canvas"
      />
    )
  }
  const pattern =
    background === 'grid'
      ? 'linear-gradient(var(--canvas-grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--canvas-grid-line) 1px, transparent 1px)'
      : 'radial-gradient(var(--canvas-grid) 1px, transparent 1px)'
  return (
    <div
      aria-hidden
      data-testid="canvas-background"
      data-background={background}
      className="pointer-events-none absolute inset-0 bg-canvas"
      style={{
        backgroundImage: pattern,
        backgroundSize: `${spacing}px ${spacing}px`,
        backgroundPosition: `${camera.x}px ${camera.y}px`
      }}
    />
  )
}
