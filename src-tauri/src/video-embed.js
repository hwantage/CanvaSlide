const params = new URLSearchParams(location.hash.slice(1))
const id = params.get('id') ?? ''
const hash = params.get('h') ?? ''
const start = Math.max(0, Math.min(604800, Number(params.get('start')) || 0))
const parentOrigin = params.get('parent') ?? ''
const allowedParent =
  /^(tauri:\/\/localhost|https?:\/\/tauri\.localhost|http:\/\/127\.0\.0\.1(?::\d+)?)$/.test(
    parentOrigin
  )
const muted = params.get('muted') === '1'
let controls
const send = (status) => {
  parent.postMessage({ channel: 'canvaslide-video', status }, parentOrigin)
}
const fail = (error) => send(error?.name === 'NotAllowedError' ? 'blocked' : 'error')
const loadSdk = (src, onload) => {
  const script = document.createElement('script')
  script.src = src
  script.onload = onload
  script.onerror = () => send('error')
  document.head.append(script)
}

function mountYouTube() {
  window.onYouTubeIframeAPIReady = () => {
    const player = new window.YT.Player('player', {
      videoId: id,
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 0,
        mute: muted ? 1 : 0,
        controls: 1,
        playsinline: 1,
        origin: location.origin,
        start
      },
      events: {
        onReady: () => {
          controls = {
            play: () => player.playVideo(),
            pause: () => player.pauseVideo(),
            mute: (value) => (value ? player.mute() : player.unMute())
          }
          controls.mute(muted)
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
  loadSdk('https://www.youtube.com/iframe_api')
}

function mountVimeo() {
  const frame = document.createElement('iframe')
  const url = new URL(`https://player.vimeo.com/video/${id}`)
  url.search = new URLSearchParams({
    autoplay: '0',
    muted: muted ? '1' : '0',
    playsinline: '1',
    autopause: '0',
    ...(hash ? { h: hash } : {})
  }).toString()
  if (start) {
    url.hash = `t=${start}s`
  }
  frame.id = 'player'
  frame.title = 'Vimeo'
  frame.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture'
  frame.referrerPolicy = 'strict-origin-when-cross-origin'
  frame.src = url.href
  document.getElementById('player').replaceWith(frame)
  loadSdk('https://player.vimeo.com/api/player.js', () => {
    const player = new window.Vimeo.Player(frame)
    player.on('play', () => send('playing'))
    player.on('pause', () => send('paused'))
    player.on('ended', () => send('paused'))
    player.on('error', () => send('error'))
    void player
      .ready()
      .then(() => player.setMuted(muted))
      .then(() => {
        controls = {
          play: () => player.play().catch(fail),
          pause: () => player.pause().catch(fail),
          mute: (value) => player.setMuted(value).catch(fail)
        }
        send('ready')
      })
      .catch(fail)
  })
}

if (allowedParent) {
  window.addEventListener('message', (event) => {
    const command = event.data?.command
    if (
      !controls ||
      event.source !== parent ||
      event.origin !== parentOrigin ||
      event.data?.channel !== 'canvaslide-video'
    ) {
      return
    }
    if (command === 'play' || command === 'pause') {
      controls[command]()
    } else if (command === 'mute' || command === 'unmute') {
      controls.mute(command === 'mute')
    }
  })
  if (location.pathname === '/youtube.html' && /^[\w-]{11}$/.test(id)) {
    mountYouTube()
  } else if (
    location.pathname === '/vimeo.html' &&
    /^\d+$/.test(id) &&
    /^[a-zA-Z0-9]*$/.test(hash)
  ) {
    mountVimeo()
  } else {
    send('error')
  }
}
