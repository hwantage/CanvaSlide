export function uploadRayTexture(gl: WebGLRenderingContext, image: HTMLImageElement): boolean {
  const upload = (source: TexImageSource) =>
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
  // Zero hidden RGB before filtering and use the compositor's native alpha format.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
  upload(image)
  if (gl.getError() === gl.NO_ERROR) {
    return true
  }

  // Some WebKit image decoders reject direct uploads even after decode() resolves.
  const transfer = document.createElement('canvas')
  transfer.width = image.naturalWidth
  transfer.height = image.naturalHeight
  const context = transfer.getContext('2d')
  if (!context) {
    return false
  }
  try {
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, transfer.width, transfer.height).data
    if (!pixels.some((value, index) => index % 4 === 3 && value > 0)) {
      return false
    }
    upload(transfer)
    return gl.getError() === gl.NO_ERROR
  } catch {
    return false
  }
}
