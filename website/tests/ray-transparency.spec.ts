import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const draw = WebGLRenderingContext.prototype.drawArrays
    WebGLRenderingContext.prototype.drawArrays = function (
      this: WebGLRenderingContext,
      ...args: Parameters<typeof draw>
    ) {
      draw.apply(this, args)
      const canvas = this.canvas
      if (
        !(canvas instanceof HTMLCanvasElement) ||
        !canvas.matches('.ray-flight canvas') ||
        canvas.dataset.alphaSample
      ) {
        return
      }
      // Read before presentation clears the default framebuffer.
      const pixels = new Uint8Array(canvas.width * canvas.height * 4)
      this.readPixels(0, 0, canvas.width, canvas.height, this.RGBA, this.UNSIGNED_BYTE, pixels)
      let transparent = 0
      let visible = 0
      let hiddenColor = 0
      let excessColor = 0
      for (let i = 0; i < pixels.length; i += 4) {
        const color = Math.max(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!)
        const alpha = pixels[i + 3]!
        if (alpha === 0) {
          transparent++
          if (color > 0) {
            hiddenColor++
          }
        } else {
          visible++
        }
        if (color > alpha) {
          excessColor++
        }
      }
      canvas.dataset.alphaSample = JSON.stringify({
        total: pixels.length / 4,
        transparent,
        visible,
        hiddenColor,
        excessColor,
        premultiplied: this.getContextAttributes()?.premultipliedAlpha,
        error: this.getError()
      })
    }
  })
})

async function expectTransparentSurface(page: Page) {
  const canvas = page.locator('.ray-flight canvas')
  await expect(page.locator('.ray-flight')).toHaveAttribute('data-renderer', 'webgl')
  const sample = await canvas.evaluate((element) => JSON.parse(element.dataset.alphaSample!))
  expect(sample.error).toBe(0)
  expect(sample.premultiplied).toBe(true)
  expect(sample.transparent).toBeGreaterThan(sample.total * 0.5)
  expect(sample.visible).toBeGreaterThan(sample.total * 0.1)
  expect(sample.hiddenColor).toBe(0)
  expect(sample.excessColor).toBe(0)
}

test('transparent mascot pixels cannot contribute hidden color to mobile compositing', async ({
  page
}) => {
  await page.goto('./')
  await expectTransparentSurface(page)
})

for (const failure of ['image', 'all', 'empty'] as const) {
  test(
    failure === 'image'
      ? 'a rejected image upload recovers through a 2D canvas'
      : `${failure} texture upload failures keep the original illustration`,
    async ({ page }) => {
      await page.addInitScript((mode) => {
        if (mode === 'empty') {
          CanvasRenderingContext2D.prototype.drawImage = () => {}
        }
        const upload = WebGLRenderingContext.prototype.texImage2D
        WebGLRenderingContext.prototype.texImage2D = function (
          this: WebGLRenderingContext,
          ...args: unknown[]
        ) {
          if (mode === 'all' || args.at(-1) instanceof HTMLImageElement) {
            const canvas = this.canvas as HTMLCanvasElement
            canvas.dataset.uploadFailures = String(Number(canvas.dataset.uploadFailures ?? 0) + 1)
            this.texParameteri(0, this.TEXTURE_MIN_FILTER, this.LINEAR)
            return
          }
          Reflect.apply(upload, this, args)
        }
      }, failure)
      await page.goto('./')
      if (failure !== 'image') {
        await expect
          .poll(async () =>
            Number(await page.locator('.ray-flight canvas').getAttribute('data-upload-failures'))
          )
          .toBeGreaterThanOrEqual(failure === 'all' ? 2 : 1)
        await expect(page.locator('.ray-flight')).toHaveAttribute('data-renderer', 'image')
        await expect(page.locator('.ray-flight img')).toBeVisible()
        await expect(page.locator('.ray-flight canvas')).toBeHidden()
      } else {
        await expectTransparentSurface(page)
      }
    }
  )
}
