import { describe, expect, it } from 'vitest'
import { createEmptyDocument } from '@shared/canvas/element-types'
import { useDocumentStore } from '@/store/document-store'
import { prepareCameraFlight } from './camera-flight-preparation'

const VIEWPORT = { width: 1200, height: 800 }

describe('prepareCameraFlight', () => {
  it('holds a flight for a painted frame even when there is nothing to raster', async () => {
    useDocumentStore.getState().loadDocument(createEmptyDocument(), null)
    const preparation = prepareCameraFlight(
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
