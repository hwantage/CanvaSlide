import { expect, it } from 'vitest'
import { createEmptyDocument, type VideoElement } from './element-types'
import { autoplayVideoIds, frameVideos } from './video-playback'

const video = (id: string, url = 'https://example.org/v.mp4'): VideoElement => ({
  id,
  type: 'video',
  url,
  x: 10,
  y: 10,
  width: 50,
  height: 50
})
it('only selects completely contained videos and respects copied-frame ownership', () => {
  const document = createEmptyDocument()
  const frame = {
    id: 'f',
    type: 'frame' as const,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    order: 0,
    name: 'Frame'
  }
  document.elements = {
    f: frame,
    copy: { ...frame, id: 'copy', frameContentKey: 'copy' },
    inside: video('inside'),
    copied: { ...video('copied'), frameContentKey: 'copy' },
    outside: { ...video('outside'), x: 90 },
    nested: { ...frame, id: 'nested', width: 70, height: 70 }
  }
  document.order = Object.keys(document.elements)
  expect(frameVideos(document, 'f').map((v) => v.id)).toEqual(['inside'])
  expect(frameVideos(document, 'copy').map((v) => v.id)).toEqual(['copied'])
  expect(frameVideos(document, 'nested').map((v) => v.id)).toEqual(['inside'])
  expect(frameVideos(document, null)).toEqual([])
  expect(frameVideos(document, 'missing')).toEqual([])
})
it('allows multiple direct/Vimeo clips but only the first YouTube clip to autoplay', () => {
  const videos = [
    video('a'),
    video('y1', 'https://youtu.be/M7lc1UVf-VE'),
    video('y2', 'https://youtu.be/aqz-KE-bpKQ'),
    video('v', 'https://vimeo.com/76979871'),
    video('b')
  ]
  expect(autoplayVideoIds(videos)).toEqual(['a', 'y1', 'v', 'b'])
})

it('skips unchecked videos without consuming the one-YouTube autoplay allowance', () => {
  const videos = [
    { ...video('manual'), autoplay: false },
    { ...video('y1', 'https://youtu.be/M7lc1UVf-VE'), autoplay: false },
    { ...video('y2', 'https://youtu.be/aqz-KE-bpKQ'), autoplay: true },
    video('legacy')
  ]
  expect(autoplayVideoIds(videos)).toEqual(['y2', 'legacy'])
})
