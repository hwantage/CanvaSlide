const vertexSource = `
attribute vec2 a_uv;
uniform float u_time;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  vec2 p = a_uv;
  float left = (1.0 - smoothstep(0.15, 0.61, p.x))
    * smoothstep(0.16, 0.32, p.y) * (1.0 - smoothstep(0.79, 0.94, p.y));
  float right = smoothstep(0.79, 0.99, p.x) * (1.0 - smoothstep(0.53, 0.76, p.y));
  float beat = sin(u_time * 1.7);
  p.y += beat * (left * 0.064 + right * 0.052);
  p.x += (1.0 - cos(u_time * 1.7)) * (left * 0.012 - right * 0.008);
  float tail = (1.0 - smoothstep(0.12, 0.34, p.y))
    * smoothstep(0.16, 0.28, p.x) * (1.0 - smoothstep(0.40, 0.53, p.x));
  p.x += tail * sin(u_time * 1.3) * 0.012;
  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
}`

const fragmentSource = `
precision mediump float;
uniform sampler2D u_image;
varying vec2 v_uv;
void main() { gl_FragColor = texture2D(u_image, v_uv); }
`

export type RaySurface = { draw: (seconds: number) => void; dispose: () => void }

export async function createRaySurface(
  canvas: HTMLCanvasElement,
  source: string
): Promise<RaySurface | null> {
  const image = new Image()
  image.src = source
  try {
    await image.decode()
  } catch {
    return null
  }
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: true,
    premultipliedAlpha: false,
    powerPreference: 'low-power'
  })
  if (!gl) {
    return null
  }
  const shaders: WebGLShader[] = []
  const program = gl.createProgram()
  const buffer = gl.createBuffer()
  const texture = gl.createTexture()
  const dispose = () => {
    shaders.forEach((shader) => gl.deleteShader(shader))
    gl.deleteProgram(program)
    gl.deleteBuffer(buffer)
    gl.deleteTexture(texture)
  }
  if (!program || !buffer || !texture) {
    dispose()
    return null
  }
  for (const [kind, sourceCode] of [
    [gl.VERTEX_SHADER, vertexSource],
    [gl.FRAGMENT_SHADER, fragmentSource]
  ] as const) {
    const shader = gl.createShader(kind)
    if (!shader) {
      dispose()
      return null
    }
    shaders.push(shader)
    gl.shaderSource(shader, sourceCode)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      dispose()
      return null
    }
    gl.attachShader(program, shader)
  }
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    dispose()
    return null
  }
  const vertices: number[] = []
  for (let row = 0; row < 28; row++) {
    for (let col = 0; col < 40; col++) {
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [0, 1],
        [1, 0],
        [1, 1]
      ]) {
        vertices.push((col + dx!) / 40, (row + dy!) / 28)
      }
    }
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  const uv = gl.getAttribLocation(program, 'a_uv')
  const time = gl.getUniformLocation(program, 'u_time')
  return {
    draw: (seconds) => {
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(program)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 0, 0)
      gl.enableVertexAttribArray(uv)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0)
      gl.uniform1f(time, seconds)
      gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 2)
    },
    dispose
  }
}
