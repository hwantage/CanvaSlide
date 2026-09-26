import { describe, expect, it } from 'vitest'
import { createEmptyDocument } from '@shared/canvas/element-types'
import { svgPreviewCache } from './svg-preview-cache'
import { prepareCameraFlight } from './camera-flight-preparation'

const VIEWPORT = { width: 1200, height: 800 }

describe('prepareCameraFlight', () => {
  it('holds a flight for a painted frame even when there is nothing to raster', async () => {
    const preparation = prepareCameraFlight(
      createEmptyDocument(),
      { x: 0, y: 0, zoom: 1 },
      { x: -500, y: -200, zoom: 3 },
      VIEWPORT
    )
    let ready = false
    void preparation.ready.then(() => {
      ready = true
    })

    // Why: starting the tween in the same frame as the layout the flight triggers is what stutters.
    expect(ready).toBe(false)
    await preparation.ready
    expect(ready).toBe(true)
    expect(() => preparation.release()).not.toThrow()
  })
})

it('uses the supplied document for SVG leases and waits for their readiness', async () => {
  const document = createEmptyDocument()
  document.assets.svg = {
    id: 'svg',
    mime: 'image/svg+xml',
    data: '<svg/>',
    width: 200,
    height: 100
  }
  document.elements.image = {
    id: 'image',
    type: 'image',
    assetId: 'svg',
    naturalWidth: 200,
    naturalHeight: 100,
    x: 0,
    y: 0,
    width: 200,
    height: 100
  }
  document.order = ['image']
  let finish!: () => void
  const release = vi.fn()
  const acquire = vi.spyOn(svgPreviewCache, 'acquire').mockReturnValue({
    ready: new Promise<void>((resolve) => {
      finish = resolve
    }).then(() => ({ src: 'blob:preview', bytes: 100, dispose: vi.fn() })),
    release
  })
  try {
    const preparation = prepareCameraFlight(
      document,
      { x: 0, y: 0, zoom: 1 },
      { x: -100, y: 0, zoom: 2 },
      VIEWPORT
    )
    expect(acquire).toHaveBeenCalledWith(document.assets.svg, 2)
    let ready = false
    void preparation.ready.then(() => {
      ready = true
    })
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    )
    expect(ready).toBe(false)
    finish()
    await preparation.ready
    expect(ready).toBe(true)
    preparation.release()
    expect(release).toHaveBeenCalledTimes(1)
  } finally {
    acquire.mockRestore()
  }
})
