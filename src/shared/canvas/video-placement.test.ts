import { expect, it } from 'vitest'
import {
  initialVideoAspectRatio,
  videoAspectRatio,
  videoInsertionRect,
  VIDEO_CHROME_HEIGHT
} from './video-placement'

it.each([16 / 9, 9 / 16, 1, 4 / 3])(
  'fits ratio %s inside the paste area, reserving control space',
  (ratio) => {
    const box = { x: 30, y: 20, width: 600, height: 440 }
    const rect = videoInsertionRect(ratio, box)
    expect(rect.width).toBeLessThanOrEqual(box.width)
    expect(rect.height).toBeLessThanOrEqual(box.height)
    expect((rect.width - 2) / (rect.height - VIDEO_CHROME_HEIGHT)).toBeCloseTo(ratio)
    expect(rect.x + rect.width / 2).toBe(330)
    expect(rect.y + rect.height / 2).toBe(240)
  }
)

it('rejects malformed dimensions and uses a portrait hint only for actual Shorts URLs', () => {
  for (const [width, height] of [
    [0, 100],
    [100, 0],
    [Infinity, 100],
    [100, Number.NaN],
    ['100', 50],
    [1, 10000]
  ]) {
    expect(videoAspectRatio(width, height)).toBeNull()
  }
  expect(videoAspectRatio(1080, 1920)).toBe(9 / 16)
  expect(initialVideoAspectRatio('https://youtube.com/shorts/M7lc1UVf-VE')).toBe(9 / 16)
  expect(initialVideoAspectRatio('https://example.org/shorts/M7lc1UVf-VE')).toBe(16 / 9)
  expect(initialVideoAspectRatio('https://youtu.be/M7lc1UVf-VE')).toBe(16 / 9)
})
