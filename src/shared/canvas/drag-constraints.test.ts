import { describe, expect, it } from 'vitest'
import { constrainToAxis, constrainToSquare } from './drag-constraints'

describe('drag-constraints', () => {
  it('squares a drag on the larger extent, keeping direction', () => {
    expect(constrainToSquare({ x: 10, y: 10 }, { x: 110, y: 40 })).toEqual({ x: 110, y: 110 })
    expect(constrainToSquare({ x: 10, y: 10 }, { x: -20, y: 90 })).toEqual({ x: -70, y: 90 })
    expect(constrainToSquare({ x: 0, y: 0 }, { x: -30, y: -50 })).toEqual({ x: -50, y: -50 })
  })

  it('treats a zero extent as positive so a straight drag still yields a square', () => {
    expect(constrainToSquare({ x: 0, y: 0 }, { x: 40, y: 0 })).toEqual({ x: 40, y: 40 })
    expect(constrainToSquare({ x: 0, y: 0 }, { x: 0, y: -40 })).toEqual({ x: 40, y: -40 })
  })

  it('locks a move to the dominant axis', () => {
    expect(constrainToAxis({ x: 30, y: 5 })).toEqual({ x: 30, y: 0 })
    expect(constrainToAxis({ x: -3, y: 12 })).toEqual({ x: 0, y: 12 })
    expect(constrainToAxis({ x: 7, y: 7 })).toEqual({ x: 7, y: 0 })
  })
})
