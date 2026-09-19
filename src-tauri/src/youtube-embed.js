const params = new URLSearchParams(location.hash.slice(1))
const id = params.get('id') ?? ''
const parentOrigin = params.get('parent') ?? ''
const allowedParent =
  /^(tauri:\/\/localhost|https?:\/\/tauri\.localhost|http:\/\/127\.0\.0\.1(?::\d+)?)$/.test(
    parentOrigin
  )
let player
let ready = false
let playing = true
let muted = params.get('muted') === '1'
const send = (status) => {
  if (allowedParent) {
    parent.postMessage({ channel: 'canvaslide-video', status }, parentOrigin)
  }
}
if (/^[\w-]{11}$/.test(id) && allowedParent) {
  window.onYouTubeIframeAPIReady = () => {
    player = new window.YT.Player('player', {
      videoId: id,
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 0,
        mute: params.get('muted') === '1' ? 1 : 0,
        controls: 1,
        playsinline: 1,
        origin: location.origin,
        start: Math.max(0, Math.min(604800, Number(params.get('start')) || 0))
      },
      events: {
        onReady: () => {
          ready = true
          if (muted) {
            player.mute()
          } else {
            player.unMute()
          }
          send('ready')
        },
        onStateChange: ({ data }) => {
          if (data === 1) {
            send('playing')
          } else if (data === 0 || data === 2) {
            send('paused')
          }
        },
        onError: () => send('error'),
        onAutoplayBlocked: () => send('blocked')
      }
    })
  }
  window.addEventListener('message', (event) => {
    if (
      event.source !== parent ||
      event.origin !== parentOrigin ||
      event.data?.channel !== 'canvaslide-video'
    ) {
      return
    }
    if (event.data.command === 'play' || event.data.command === 'pause') {
      playing = event.data.command === 'play'
      if (ready) {
        if (playing) {
          player.playVideo()
        } else {
          player.pauseVideo()
        }
      }
    }
    if (event.data.command === 'mute') {
      muted = true
      if (ready) {
        player.mute()
      }
    }
    if (event.data.command === 'unmute') {
      muted = false
      if (ready) {
        player.unMute()
      }
    }
  })
  const script = document.createElement('script')
  script.src = 'https://www.youtube.com/iframe_api'
  script.onerror = () => send('error')
  document.head.append(script)
}
