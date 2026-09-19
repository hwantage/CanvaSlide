import { afterEach, expect, it, vi } from 'vitest'
import { attachProviderPlayer } from './provider-player'
import { parseVideoSource } from '../canvas/video-source'

afterEach(() => vi.unstubAllGlobals())

it('honors pause and mute changes made before YouTube becomes ready, then resumes the same player', async () => {
  const playVideo = vi.fn()
  const pauseVideo = vi.fn()
  const mute = vi.fn()
  const unMute = vi.fn()
  const destroy = vi.fn()
  const target = { playVideo, pauseVideo, mute, unMute, destroy }
  let ready!: () => void
  vi.stubGlobal('YT', {
    Player: class {
      constructor(
        _: unknown,
        options: { events: { onReady: (event: { target: typeof target }) => void } }
      ) {
        ready = () => options.events.onReady({ target })
      }
      playVideo = playVideo
      pauseVideo = pauseVideo
      mute = mute
      unMute = unMute
      destroy = destroy
    }
  })
  const player = await attachProviderPlayer(
    document.createElement('iframe'),
    parseVideoSource('https://youtu.be/M7lc1UVf-VE')!,
    true,
    () => true,
    vi.fn()
  )
  player!.pause()
  player!.mute(false)
  expect(pauseVideo).not.toHaveBeenCalled()
  ready()
  expect(pauseVideo).toHaveBeenCalledOnce()
  expect(unMute).toHaveBeenCalledOnce()
  expect(playVideo).not.toHaveBeenCalled()
  player!.play()
  expect(playVideo).toHaveBeenCalledOnce()
  expect(destroy).not.toHaveBeenCalled()
  player!.destroy()
  expect(destroy).toHaveBeenCalledOnce()
})

it('honors Vimeo pause before readiness and never starts a disposed player', async () => {
  let ready!: () => void
  const gate = new Promise<void>((done) => {
    ready = done
  })
  const play = vi.fn().mockResolvedValue(undefined)
  const pause = vi.fn().mockResolvedValue(undefined)
  const destroy = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('Vimeo', {
    Player: class {
      on = vi.fn()
      ready = () => gate
      setMuted = vi.fn().mockResolvedValue(undefined)
      play = play
      pause = pause
      destroy = destroy
    }
  })
  let alive = true
  const source = parseVideoSource('https://vimeo.com/76979871')!
  const player = await attachProviderPlayer(
    document.createElement('iframe'),
    source,
    true,
    () => alive,
    vi.fn()
  )
  let lateAlive = true
  const late = await attachProviderPlayer(
    document.createElement('iframe'),
    source,
    true,
    () => lateAlive,
    vi.fn()
  )
  player!.pause()
  lateAlive = false
  late!.destroy()
  ready()
  await vi.waitFor(() => expect(pause).toHaveBeenCalledOnce())
  expect(play).not.toHaveBeenCalled()
  player!.play()
  expect(play).toHaveBeenCalledOnce()
  alive = false
  player!.destroy()
  expect(destroy).toHaveBeenCalledTimes(2)
})
