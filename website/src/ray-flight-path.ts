type FlightPoint = {
  at: number
  x: number
  y: number
  width: number
  opacity: number
  bank: number
}
export type FlightPath = FlightPoint[]
export type RayPose = Omit<FlightPoint, 'at'> & {
  stage: 'hero' | 'swimming' | 'docked'
}

export function measureRayPath(origin: HTMLElement, dock: HTMLElement): FlightPath {
  const screenWidth = window.innerWidth
  const screenHeight = window.innerHeight
  const end = Math.max(1, document.documentElement.scrollHeight - screenHeight)
  const start = origin.getBoundingClientRect()
  const finish = dock.getBoundingClientRect()
  const mobile = screenWidth < 801
  const wingSpan = Math.min(mobile ? 280 : 490, screenWidth * 0.63)
  const low = mobile ? 0.085 : 0.15
  const side = (right: boolean) => screenWidth * (right ? 0.82 : 0.18)
  const points: FlightPath = [
    {
      at: 0,
      x: start.left + start.width / 2,
      y: start.top + window.scrollY + start.height / 2,
      width: start.width,
      opacity: 1,
      bank: 0
    },
    {
      at: Math.min(end * 0.14, Math.max(420, screenHeight * 0.85)),
      x: side(true),
      y: screenHeight * 0.54,
      width: wingSpan,
      opacity: low,
      bank: 5
    }
  ]
  const stops = [
    ['#sharing', 0.6, false],
    ['#overview', 0.55, true],
    ['.features-section', 0.55, false]
  ] as const
  for (const [selector, fraction, right] of stops) {
    const element = document.querySelector<HTMLElement>(selector)
    if (!element) {
      continue
    }
    const bounds = element.getBoundingClientRect()
    const at = bounds.top + window.scrollY + bounds.height * fraction - screenHeight * 0.5
    if (at > points.at(-1)!.at + 100 && at < end - 220) {
      points.push({
        at,
        x: side(right),
        y: screenHeight * (right ? 0.54 : 0.6),
        width: wingSpan * (right ? 1.08 : 0.94),
        opacity: low,
        bank: right ? -6 : 6
      })
    }
  }
  points.push({
    at: end,
    x: finish.left + finish.width / 2,
    y: finish.top + window.scrollY - end + finish.height / 2,
    width: finish.width,
    opacity: 1,
    bank: 0
  })
  return points
}

export function rayPoseAt(scroll: number, path: FlightPath): RayPose {
  const end = path.at(-1)!
  const y = Math.max(0, Math.min(end.at, scroll))
  let next = 1
  while (next < path.length - 1 && path[next]!.at < y) {
    next++
  }
  const from = path[next - 1]!
  const to = path[next]!
  const progress = (y - from.at) / Math.max(1, to.at - from.at)
  const eased = progress * progress * (3 - 2 * progress)
  const mix = (a: number, b: number) => a + (b - a) * eased
  return {
    x: mix(from.x, to.x),
    y: mix(from.y, to.y),
    width: mix(from.width, to.width),
    opacity: mix(from.opacity, to.opacity),
    bank: mix(from.bank, to.bank),
    stage: y < 1 ? 'hero' : y >= end.at - 1 ? 'docked' : 'swimming'
  }
}

export function followRayPose(current: RayPose, target: RayPose, elapsed: number) {
  const distance = Math.max(
    Math.abs(target.x - current.x),
    Math.abs(target.y - current.y),
    Math.abs(target.width - current.width),
    Math.abs(target.opacity - current.opacity) * 1000,
    Math.abs(target.bank - current.bank) * 10
  )
  if (distance < 0.5) {
    return { pose: target, moving: false }
  }
  // Ease toward the visible destination so a page jump cannot replay every turn.
  const amount = 1 - Math.exp(-elapsed / 650)
  const mix = (from: number, to: number) => from + (to - from) * amount
  const pose: RayPose = {
    x: mix(current.x, target.x),
    y: mix(current.y, target.y),
    width: mix(current.width, target.width),
    opacity: mix(current.opacity, target.opacity),
    bank: mix(current.bank, target.bank),
    stage: 'swimming'
  }
  return { pose, moving: true }
}
