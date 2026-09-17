import { cameraEasings, DEFAULT_CAMERA_EASING, type CameraEasing } from './camera-easing'
import {
  DEFAULT_CAMERA_ARC,
  DEFAULT_TRANSITION_MS,
  MAX_CAMERA_ARC,
  MAX_ROLL_DEGREES,
  MAX_TRANSITION_MS,
  MIN_CAMERA_ARC
} from './element-types'
import type { DocumentSettings, FrameElement, FrameTransition } from './element-types'

/** A frame's camera direction with every document-level default already applied. */
export type ResolvedFrameTransition = {
  ms: number
  easing: CameraEasing
  arc: number
  roll: number
  spotlight: number
}

/**
 * Why: the standalone player parses its embedded document with `JSON.parse` and no zod, so a
 * hand-written or generated file can hand us 0, NaN or 1e6 here. Unchecked, those reach the van Wijk
 * maths and produce a NaN camera, which blanks the page. Every value is forced back into range.
 */
function inRange(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

/** Frame overrides win; anything the frame leaves unset falls back to the document settings. */
export function resolveFrameTransition(
  frame: FrameElement | undefined,
  settings: DocumentSettings
): ResolvedFrameTransition {
  const own = frame?.transition
  const easing = own?.easing ?? settings.transitionEasing ?? DEFAULT_CAMERA_EASING
  return {
    ms: inRange(own?.ms ?? settings.transitionMs, 0, MAX_TRANSITION_MS, DEFAULT_TRANSITION_MS),
    easing: cameraEasings.includes(easing) ? easing : DEFAULT_CAMERA_EASING,
    arc: inRange(
      own?.arc ?? settings.transitionArc,
      MIN_CAMERA_ARC,
      MAX_CAMERA_ARC,
      DEFAULT_CAMERA_ARC
    ),
    roll: inRange(own?.roll, -MAX_ROLL_DEGREES, MAX_ROLL_DEGREES, 0),
    spotlight: inRange(own?.spotlight ?? settings.spotlight, 0, 1, 0)
  }
}

export const motionFields = ['ms', 'easing', 'arc', 'roll', 'spotlight'] as const
export type MotionField = (typeof motionFields)[number]

/**
 * Which parts of this frame's flight will actually look different from the document default.
 * Compared after resolving, not by looking for override keys: a frame that pins the value the
 * document already uses presents identically, and the frame list must not claim otherwise.
 */
export function frameMotionDiff(frame: FrameElement, settings: DocumentSettings): MotionField[] {
  const mine = resolveFrameTransition(frame, settings)
  const base = resolveFrameTransition(undefined, settings)
  return motionFields.filter((field) => mine[field] !== base[field])
}

/**
 * Strips every field that already matches the document. An override has to mean "this frame is
 * different" — the panel's dot and the frame list's mark both say so — and picking the step the
 * document already uses is not a difference, whatever route the author took to get back to it.
 */
export function pruneFrameTransition(
  transition: FrameTransition,
  settings: DocumentSettings
): FrameTransition | undefined {
  const base = resolveFrameTransition(undefined, settings)
  const kept = Object.entries(transition).filter(([field, value]) => {
    const fallback = base[field as MotionField]
    if (value === undefined) {
      return false
    }
    return typeof value === 'number' && typeof fallback === 'number'
      ? Math.abs(value - fallback) >= 1e-6
      : value !== fallback
  })
  return kept.length > 0 ? (Object.fromEntries(kept) as FrameTransition) : undefined
}
