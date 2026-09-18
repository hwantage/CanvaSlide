import { describe, expect, it } from 'vitest'
import { insertElement } from './document-mutations'
import { createEmptyDocument, type CanvasElement } from './element-types'
import { fitRectToViewport } from './frame-fit'
import {
  LEVEL_SHOT,
  frameCamera,
  previewDeparture,
  shotTween,
  spotlightMaskPath,
  stageRollStyle
} from './presentation-shot'

const frame = (id: string, order: number, roll?: number): CanvasElement => ({
  id,
  type: 'frame',
  name: id,
  order,
  x: order * 1000,
  y: 0,
  width: 400,
  height: 300,
  ...(roll === undefined ? {} : { transition: { roll, spotlight: 0.5 } })
})

const viewport = { width: 800, height: 600 }

function deck() {
  let document = createEmptyDocument()
  for (const element of [frame('a', 1), frame('b', 2, 15)]) {
    document = insertElement(document, element)
  }
  return document
}

describe('presentation-shot', () => {
  it('fits a frame with its own roll folded into the camera', () => {
    const document = deck()
    expect(frameCamera(document, 1, viewport)).toEqual(
      fitRectToViewport({ x: 2000, y: 0, width: 400, height: 300 }, viewport, undefined, 15)
    )
    expect(frameCamera(document, 5, viewport)).toBeNull()
  })

  it('tweens roll, dimming and the cut-out together, and reports when nothing moves', () => {
    const from = { roll: 0, spotlight: 0, spotlightRect: { x: 0, y: 0, width: 100, height: 100 } }
    const tween = shotTween(from, {
      roll: 10,
      spotlight: 1,
      spotlightRect: { x: 100, y: 0, width: 100, height: 100 }
    })
    expect(tween?.(0.5)).toEqual({
      roll: 5,
      spotlight: 0.5,
      spotlightRect: { x: 50, y: 0, width: 100, height: 100 }
    })
    expect(shotTween(from, from)).toBeUndefined()
    // Why: the overview levels and lights the stage but leaves the hole where it stands.
    const lit = { ...from, spotlight: 0.5 }
    expect(shotTween(lit, LEVEL_SHOT)?.(1)).toEqual({
      ...LEVEL_SHOT,
      spotlightRect: lit.spotlightRect
    })
    // Why: the target must stay lit from the first instant, even when departing without a hole.
    expect(shotTween(LEVEL_SHOT, { ...from, spotlight: 1 })?.(0).spotlightRect).toEqual(
      from.spotlightRect
    )
  })

  it('opens the first frame from wherever the editor is and later frames on the previous one', () => {
    const document = deck()
    expect(previewDeparture(document, 'a', viewport)).toEqual({
      index: 0,
      departureIndex: null,
      camera: null,
      shot: LEVEL_SHOT
    })
    const second = previewDeparture(document, 'b', viewport)
    expect(second).toMatchObject({
      index: 1,
      departureIndex: 0,
      camera: frameCamera(document, 0, viewport),
      shot: { roll: 0, spotlight: 0, spotlightRect: { x: 1000, y: 0, width: 400, height: 300 } }
    })
    expect(previewDeparture(document, 'nope', viewport)).toBeNull()
  })

  it('punches the lit frame out of a dim that outsizes the rolled viewport', () => {
    const camera = { x: 10, y: 20, zoom: 2 }
    const shot = { roll: 0, spotlight: 0.4, spotlightRect: { x: 5, y: 5, width: 50, height: 25 } }
    expect(spotlightMaskPath(shot, camera, viewport)).toBe(
      'M-2400,-1800H2400V1800H-2400ZM20,30h100v50h-100Z'
    )
    expect(spotlightMaskPath({ ...shot, spotlight: 0 }, camera, viewport)).toBeNull()
    expect(spotlightMaskPath({ ...shot, spotlightRect: null }, camera, viewport)).toBeNull()
  })

  it('leaves a level stage without a transform', () => {
    expect(stageRollStyle(0)).toEqual({ transform: '', willChange: 'auto' })
    expect(stageRollStyle(-22)).toEqual({ transform: 'rotate(-22deg)', willChange: 'transform' })
  })
})
