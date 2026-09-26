import { setCameraFlightPreparation, useCameraStore } from './camera-store'

beforeEach(() => {
  useCameraStore.getState().setCamera({ x: 0, y: 0, zoom: 1 })
  useCameraStore.getState().setViewport({ width: 1200, height: 800 })
})

afterEach(() => {
  useCameraStore.getState().cancelAnimation()
  setCameraFlightPreparation(undefined)
})

it('injects preparation after marking the flight and releases it when cancelled', async () => {
  let ready!: () => void
  const release = vi.fn()
  const from = useCameraStore.getState().camera
  const target = { x: -500, y: -200, zoom: 3 }
  const prepare = vi.fn(() => {
    expect(useCameraStore.getState()).toMatchObject({
      flightTarget: target,
      flightZoom: 3,
      animationActive: true
    })
    return {
      ready: new Promise<void>((resolve) => {
        ready = resolve
      }),
      release
    }
  })
  setCameraFlightPreparation(prepare)
  useCameraStore.getState().animateTo(target, 350)
  expect(prepare).toHaveBeenCalledWith(from, target, { width: 1200, height: 800 })
  expect(useCameraStore.getState().camera).toBe(from)
  useCameraStore.getState().cancelAnimation()
  expect(release).toHaveBeenCalledTimes(1)
  ready()
  await Promise.resolve()
  expect(useCameraStore.getState()).toMatchObject({
    camera: from,
    animationActive: false,
    flightTarget: null,
    flightZoom: null
  })
})
