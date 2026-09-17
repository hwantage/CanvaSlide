/** Easing curves a frame can pick for its camera flight. `smooth` is the long-standing default. */
export const cameraEasings = ['smooth', 'linear', 'accelerate', 'decelerate', 'overshoot'] as const
export type CameraEasing = (typeof cameraEasings)[number]

export const DEFAULT_CAMERA_EASING: CameraEasing = 'smooth'

const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

export function easeInOutCubic(t: number): number {
  const c = clamp01(t)
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2
}

function easeInCubic(t: number): number {
  const c = clamp01(t)
  return c * c * c
}

function easeOutCubic(t: number): number {
  const c = clamp01(t)
  return 1 - (1 - c) ** 3
}

// Why: sails past the target and settles back. The interpolator is defined outside [0,1], so the
// overshoot really does travel beyond the frame instead of clipping at it.
const OVERSHOOT = 1.7
function easeOutBack(t: number): number {
  const c = clamp01(t)
  return 1 + (OVERSHOOT + 1) * (c - 1) ** 3 + OVERSHOOT * (c - 1) ** 2
}

const curves: Record<CameraEasing, (t: number) => number> = {
  smooth: easeInOutCubic,
  linear: clamp01,
  accelerate: easeInCubic,
  decelerate: easeOutCubic,
  overshoot: easeOutBack
}

export function cameraEasingFn(kind: CameraEasing = DEFAULT_CAMERA_EASING): (t: number) => number {
  return curves[kind] ?? easeInOutCubic
}
