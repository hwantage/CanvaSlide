import { describe, expect, it } from 'vitest'
import { createEmptyDocument, type FrameElement } from './element-types'
import { selectedFrameIds, selectFrameInList, stepSelectedFrame } from './frame-selection'

const frames: FrameElement[] = ['a', 'b', 'c', 'd'].map((id, index) => ({
  id,
  type: 'frame',
  name: id,
  order: index + 1,
  x: index * 500,
  y: 0,
  width: 400,
  height: 300
}))
const single = { range: false, toggle: false }
const toggle = { range: false, toggle: true }
const range = { range: true, toggle: false }

describe('selectFrameInList', () => {
  it('replaces a selection on a plain click and toggles individual rows', () => {
    expect(selectFrameInList(frames, ['a', 'c'], 'b', 'a', single)).toEqual({
      selectedIds: ['b'],
      anchorId: 'b'
    })
    expect(selectFrameInList(frames, ['a', 'c'], 'b', 'a', toggle).selectedIds).toEqual([
      'a',
      'c',
      'b'
    ])
    expect(selectFrameInList(frames, ['a', 'c'], 'a', 'c', toggle).selectedIds).toEqual(['c'])
    expect(selectFrameInList(frames, ['a'], 'a', 'a', toggle).selectedIds).toEqual([])
  })

  it('extends and shrinks an inclusive range without moving its anchor', () => {
    const forward = selectFrameInList(frames, ['b'], 'd', 'b', range)
    expect(forward).toEqual({ selectedIds: ['b', 'c', 'd'], anchorId: 'b' })
    expect(
      selectFrameInList(frames, forward.selectedIds, 'c', forward.anchorId, range).selectedIds
    ).toEqual(['b', 'c'])
    expect(selectFrameInList(frames, ['c'], 'a', 'c', range)).toEqual({
      selectedIds: ['a', 'b', 'c'],
      anchorId: 'c'
    })
  })

  it('uses a canvas selection as the anchor and recovers from stale anchors', () => {
    for (const anchor of [null, 'deleted', 'd']) {
      expect(selectFrameInList(frames, ['b'], 'd', anchor, range)).toEqual({
        selectedIds: ['b', 'c', 'd'],
        anchorId: 'b'
      })
    }
    expect(selectFrameInList(frames, [], 'c', null, range)).toEqual({
      selectedIds: ['c'],
      anchorId: 'c'
    })
  })

  it('adds a range with both modifiers and ignores missing targets', () => {
    expect(
      selectFrameInList(frames, ['a', 'c'], 'd', 'c', { range: true, toggle: true }).selectedIds
    ).toEqual(['a', 'c', 'd'])
    expect(selectFrameInList(frames, ['a'], 'missing', 'a', range)).toEqual({
      selectedIds: ['a'],
      anchorId: 'a'
    })
  })
})

describe('selected frame sequence', () => {
  it('uses deck order, drops stale/non-frame IDs, and never repeats a frame', () => {
    const document = createEmptyDocument()
    document.elements = Object.fromEntries(frames.map((frame) => [frame.id, frame]))
    document.elements.text = {
      id: 'text',
      type: 'text',
      text: 'Label',
      x: 0,
      y: 0,
      width: 100,
      height: 20,
      textStyle: { color: '#000', fontSize: 16, bold: false, align: 'left' }
    }
    document.order = ['d', 'b', 'a', 'c', 'text']
    expect(selectedFrameIds(document, ['d', 'missing', 'text', 'a', 'a'])).toEqual(['a', 'd'])
    document.elements.a = { ...frames[0]!, order: 5 }
    expect(selectedFrameIds(document, ['a', 'd'])).toEqual(['d', 'a'])
  })

  it('steps only through selected frames and stops at either end', () => {
    expect(stepSelectedFrame(['a', 'c', 'd'], 'a', 1)).toBe('c')
    expect(stepSelectedFrame(['a', 'c', 'd'], 'd', -1)).toBe('c')
    expect(stepSelectedFrame(['a', 'c', 'd'], 'a', -1)).toBeNull()
    expect(stepSelectedFrame(['a', 'c', 'd'], 'd', 1)).toBeNull()
    expect(stepSelectedFrame(['a', 'c', 'd'], 'deleted', 1)).toBeNull()
    expect(stepSelectedFrame(['a'], 'a', 1)).toBeNull()
    expect(stepSelectedFrame([], 'a', 1)).toBeNull()
  })
})
