import { expect, test } from '@playwright/test'

test('retains photo colors, source alpha and nested mask pixels in cached detail surfaces', async ({
  page
}) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .map((r) => r.name)
      .filter((name) => name.includes('/src/lib/svg-image-preview.ts'))
      .at(-1)!
    const { createSvgImagePreview } = await import(url)
    const photo = document.createElement('canvas')
    photo.width = 256
    photo.height = 128
    const paint = photo.getContext('2d')!
    const colors = paint.createLinearGradient(0, 0, 256, 128)
    colors.addColorStop(0, 'rgba(255, 50, 20, .4)')
    colors.addColorStop(1, 'rgba(10, 150, 240, .9)')
    paint.fillStyle = colors
    paint.fillRect(0, 0, 256, 128)
    paint.clearRect(100, 40, 40, 30)
    const png = photo.toDataURL()
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 128">
      <defs>
        <linearGradient id="fade"><stop stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>
        <radialGradient id="round"><stop stop-color="white"/><stop offset="1" stop-color="black"/></radialGradient>
        <mask id="a"><rect width="100%" height="100%" fill="url(#fade)"/></mask>
        <mask id="b"><rect width="100%" height="100%" fill="url(#round)"/></mask>
      </defs>
      <g mask="url(#a)" opacity=".8"><image width="100%" height="100%" opacity=".7"
        href="${png}" mask="url(#b)"/></g></svg>`
    const asset = {
      id: 'photo',
      mime: 'image/svg+xml',
      width: 256,
      height: 128,
      data: `data:image/svg+xml;base64,${btoa(svg)}`
    }
    const original = new Image()
    original.src = `data:image/svg+xml;base64,${btoa(svg.replace('<svg ', '<svg width="1280" height="640" '))}`
    await original.decode()
    const expected = document.createElement('canvas')
    expected.width = 1280
    expected.height = 640
    expected.getContext('2d')!.drawImage(original, 0, 0)
    const differences: { color: number; alpha: number }[] = []
    let released = true
    for (const crop of [
      { x: 0, y: 0, width: 0.5, height: 1 },
      { x: 0.5, y: 0, width: 0.5, height: 1 },
      { x: 0.15, y: 0.2, width: 0.6, height: 0.55 }
    ]) {
      const pixels = { width: crop.width * 1280, height: crop.height * 640 }
      const detail = await createSvgImagePreview(asset, 2, { crop, pixels }, undefined, 'canvas')
      if (!detail.canvas) {
        throw new Error('Missing detail surface')
      }
      const actual = detail.canvas
        .getContext('2d')!
        .getImageData(0, 0, pixels.width, pixels.height).data
      const reference = expected
        .getContext('2d')!
        .getImageData(crop.x * 1280, crop.y * 640, pixels.width, pixels.height).data
      let color = 0
      let alpha = 0
      // Premultiplied color measures visible differences without amplifying nearly transparent RGB.
      for (let i = 0; i < actual.length; i += 4) {
        alpha += Math.abs(actual[i + 3]! - reference[i + 3]!)
        for (let channel = 0; channel < 3; channel++) {
          color += Math.abs(
            (actual[i + channel]! * actual[i + 3]!) / 255 -
              (reference[i + channel]! * reference[i + 3]!) / 255
          )
        }
      }
      differences.push({
        color: ((color / actual.length) * 4) / 3,
        alpha: (alpha / actual.length) * 4
      })
      detail.dispose()
      released &&= detail.canvas.width === 0 && detail.canvas.height === 0
    }
    original.src = ''
    return { differences, released }
  })
  for (const difference of result.differences) {
    expect(difference.color).toBeLessThan(1)
    expect(difference.alpha).toBeLessThan(1)
  }
  expect(result.released).toBe(true)
})
