import { cameraEasings, DEFAULT_CAMERA_EASING, type CameraEasing } from './camera-easing'
import {
  defaultDocumentSettings,
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

export function frameTransitionSelection(
  frames: readonly FrameElement[],
  settings: DocumentSettings
): { resolved: ResolvedFrameTransition; mixed: MotionField[]; nonDefault: MotionField[] } {
  const motions = frames.map((frame) => resolveFrameTransition(frame, settings))
  const resolved = motions[0] ?? resolveFrameTransition(undefined, settings)
  const base = resolveFrameTransition(undefined, defaultDocumentSettings)
  return {
    resolved,
    mixed: motionFields.filter((field) =>
      motions.some((motion) => motion[field] !== resolved[field])
    ),
    nonDefault: motionFields.filter((field) =>
      motions.some((motion) => motion[field] !== base[field])
    )
  }
}

export function mergeFrameTransition(
  frame: FrameElement,
  change: FrameTransition,
  settings: DocumentSettings
): FrameTransition | undefined {
  return pruneFrameTransition({ ...frame.transition, ...change }, settings)
}

/** Keep explicit defaults where removing overrides would restore non-default inherited effects. */
export function resetFrameTransition(settings: DocumentSettings): FrameTransition | undefined {
  return pruneFrameTransition(resolveFrameTransition(undefined, defaultDocumentSettings), settings)
}

/** Effective camera effects that differ from the application defaults, including inheritance. */
export function frameMotionDiff(frame: FrameElement, settings: DocumentSettings): MotionField[] {
  const mine = resolveFrameTransition(frame, settings)
  const base = resolveFrameTransition(undefined, defaultDocumentSettings)
  return motionFields.filter((field) => mine[field] !== base[field])
}

/** Remove redundant overrides while preserving the document’s inherited camera settings. */
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
    return value !== fallback
  })
  return kept.length > 0 ? (Object.fromEntries(kept) as FrameTransition) : undefined
}
