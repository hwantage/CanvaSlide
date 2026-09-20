import { describe, expect, it } from 'vitest'
import {
  textMetricsFollowLayoutZoom,
  worldLayerWillChange,
  zoomLayerCssStyle
} from './zoom-layer-style'

const WEBKIT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
const WKWEBVIEW =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)'
const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const WEBVIEW2 =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0'
const FIREFOX =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:128.0) Gecko/20100101 Firefox/128.0'

describe('zoom layer style', () => {
  it('recognises WebKit by the token every Blink and WebView2 agent adds after it', () => {
    expect(textMetricsFollowLayoutZoom(WEBKIT)).toBe(true)
    expect(textMetricsFollowLayoutZoom(WKWEBVIEW)).toBe(true)
    expect(textMetricsFollowLayoutZoom(CHROME)).toBe(false)
    expect(textMetricsFollowLayoutZoom(WEBVIEW2)).toBe(false)
    expect(textMetricsFollowLayoutZoom(FIREFOX)).toBe(false)
  })

  it('turns optical sizing off only where it would tie text metrics to the layout zoom', () => {
    expect(zoomLayerCssStyle(2.5, WKWEBVIEW)).toEqual({ zoom: 2.5, fontOpticalSizing: 'none' })
    expect(zoomLayerCssStyle(1, WEBVIEW2)).toEqual({ zoom: 1, fontOpticalSizing: 'auto' })
  })

  it.each([CHROME, WEBVIEW2])(
    'leaves world compositing to the engine through exit: %s',
    (userAgent) => {
      for (const [presenting, previewing] of [
        [false, false],
        [true, false],
        [true, true]
      ] as const) {
        expect(
          worldLayerWillChange({
            denseVectors: true,
            presenting,
            previewing,
            userAgent
          })
        ).toBe('auto')
      }
    }
  )

  it.each([FIREFOX, ''])('preserves the density-based hint in other engines: %s', (userAgent) => {
    for (const presenting of [false, true]) {
      for (const previewing of [false, true]) {
        expect(
          worldLayerWillChange({ denseVectors: true, presenting, previewing, userAgent })
        ).toBe('transform')
        expect(
          worldLayerWillChange({ denseVectors: false, presenting, previewing, userAgent })
        ).toBe('auto')
      }
    }
  })

  it.each([WEBKIT, WKWEBVIEW])(
    'keeps the WebKit dense editor/preview optimization: %s',
    (userAgent) => {
      const options = { denseVectors: true, presenting: false, previewing: false, userAgent }
      expect(worldLayerWillChange(options)).toBe('transform')
      expect(worldLayerWillChange({ ...options, presenting: true })).toBe('auto')
      expect(worldLayerWillChange({ ...options, presenting: true, previewing: true })).toBe(
        'transform'
      )
      expect(worldLayerWillChange({ ...options, denseVectors: false })).toBe('auto')
    }
  )
})
