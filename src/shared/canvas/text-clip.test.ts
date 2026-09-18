import {
  defaultTextStyle,
  createEmptyDocument,
  textElementSchema,
  type TextElement
} from './element-types'
import { textClipPath, visibleTextRect } from './text-clip'
import { elementsInBox, hitTestTopmost } from './element-bounds'
import { withFrameContents } from './frame-contents'

const text: TextElement = {
  id: 'text',
  type: 'text',
  x: 0,
  y: 0,
  width: 100,
  height: 40,
  text: 'Clipped text',
  textStyle: defaultTextStyle,
  clip: { top: 0, left: 0.25, right: 0.25, bottom: 0.5 }
}

test('shares proportional clipping between the editor and exported player', () => {
  expect(textClipPath(text.clip)).toBe('inset(0% 25% 50% 25%)')
  expect(textClipPath(undefined)).toBeUndefined()
  expect(visibleTextRect(text)).toEqual({ x: 25, y: 0, width: 50, height: 20 })
  expect(visibleTextRect({ ...text, x: 100, width: 200 })).toEqual({
    x: 150,
    y: 0,
    width: 100,
    height: 20
  })
  expect(textElementSchema.parse(text)).toEqual(text)
  expect(textElementSchema.safeParse({ ...text, clip: { ...text.clip, left: 1 } }).success).toBe(
    false
  )
})

test('hidden text areas do not intercept clicks and clipped text moves with its frame', () => {
  const doc = { ...createEmptyDocument(), elements: { text }, order: ['text'] }
  const chrome = { titleHeight: 0, borderWidth: 0 }
  expect(hitTestTopmost(doc, { x: 10, y: 10 }, chrome)).toBeNull()
  expect(hitTestTopmost(doc, { x: 30, y: 30 }, chrome)).toBeNull()
  expect(hitTestTopmost(doc, { x: 30, y: 10 }, chrome)).toBe(text)
  expect(elementsInBox(doc, { x: 0, y: 0, width: 20, height: 10 })).toEqual([])
  const frame = {
    id: 'frame',
    type: 'frame' as const,
    name: '',
    order: 0,
    ...visibleTextRect(text)
  }
  expect(
    withFrameContents({ ...doc, elements: { text, frame }, order: ['frame', 'text'] }, ['frame'])
  ).toEqual(['frame', 'text'])
})
