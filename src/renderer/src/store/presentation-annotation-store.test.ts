import { beforeEach, describe, expect, it } from 'vitest'
import {
  selectAnnotationCursor,
  selectPointing,
  usePresentationAnnotationStore
} from './presentation-annotation-store'
import { usePresentationStore } from './presentation-store'

const annotation = () => usePresentationAnnotationStore.getState()

beforeEach(() => {
  usePresentationAnnotationStore.setState({ pointing: false, clearCount: 0 })
  usePresentationStore.setState({ active: false })
})

describe('the pointer', () => {
  it('toggles on and off again', () => {
    annotation().togglePointer()
    expect(selectPointing(usePresentationAnnotationStore.getState())).toBe(true)
    annotation().togglePointer()
    expect(selectPointing(usePresentationAnnotationStore.getState())).toBe(false)
  })

  it('takes the arrow cursor off the viewport while it is out', () => {
    expect(selectAnnotationCursor(usePresentationAnnotationStore.getState())).toBe('default')
    annotation().togglePointer()
    expect(selectAnnotationCursor(usePresentationAnnotationStore.getState())).toBe('none')
  })
})

describe('clearInk', () => {
  it('bumps a counter the ink layer can compare, and never rewinds it', () => {
    annotation().clearInk()
    annotation().clearInk()
    expect(annotation().clearCount).toBe(2)
    annotation().reset()
    expect(annotation().clearCount).toBe(2)
  })

  it('leaves the pointer out, so erasing does not put the laser away', () => {
    annotation().togglePointer()
    annotation().clearInk()
    expect(annotation().pointing).toBe(true)
  })
})

describe('leaving a show', () => {
  it('puts the pointer away, so the next show starts with a bare cursor', () => {
    usePresentationStore.setState({ active: true })
    annotation().togglePointer()
    usePresentationStore.setState({ active: false })
    expect(annotation().pointing).toBe(false)
  })

  it('leaves it out while the show is still running', () => {
    usePresentationStore.setState({ active: true })
    annotation().togglePointer()
    usePresentationStore.setState({ index: 3 })
    expect(annotation().pointing).toBe(true)
  })
})
