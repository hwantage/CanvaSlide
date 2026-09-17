import type { CameraEasing } from '@shared/canvas/camera-easing'
import { DEFAULT_CAMERA_ARC, DEFAULT_TRANSITION_MS } from '@shared/canvas/element-types'
import type { MotionField, ResolvedFrameTransition } from '@shared/canvas/frame-transition'
import { t, type UiStringKey } from '@/i18n/ui-strings'

/**
 * Named steps for the camera controls. ρ 1.41 and `roll: -22` are not units an author thinks in,
 * so the panel offers a handful of steps and keeps the numbers for the advanced disclosure.
 */
export type MotionPreset = { value: number; label: UiStringKey }

export const durationPresets: readonly MotionPreset[] = [
  { value: 400, label: 'motion.duration.fast' },
  { value: DEFAULT_TRANSITION_MS, label: 'motion.duration.normal' },
  { value: 2000, label: 'motion.duration.slow' }
]

export const arcPresets: readonly MotionPreset[] = [
  { value: 1, label: 'motion.arc.straight' },
  { value: DEFAULT_CAMERA_ARC, label: 'motion.arc.normal' },
  { value: 2.2, label: 'motion.arc.wide' }
]

/** Magnitudes; `rollOptions()` mirrors them into the signed steps the panel offers. */
export const rollPresets: readonly MotionPreset[] = [
  { value: 0, label: 'motion.roll.none' },
  { value: 5, label: 'motion.roll.slight' },
  { value: 15, label: 'motion.roll.medium' },
  { value: 30, label: 'motion.roll.strong' }
]

export const spotlightPresets: readonly MotionPreset[] = [
  { value: 0, label: 'motion.spotlight.none' },
  { value: 0.2, label: 'motion.spotlight.soft' },
  { value: 0.5, label: 'motion.spotlight.medium' },
  { value: 1, label: 'motion.spotlight.strong' }
]

/**
 * The tilt as one ordered scale, left through none to right. A single list beats a magnitude plus
 * a flip button: the control says which way the frame leans without anyone having to press it.
 */
export function rollOptions(): { value: number; label: string }[] {
  const strengths = rollPresets.filter((preset) => preset.value !== 0)
  const leaning = (sign: -1 | 1, direction: UiStringKey) => (preset: MotionPreset) => ({
    value: sign * preset.value,
    label: t('motion.roll.value', { direction: t(direction), amount: t(preset.label) })
  })
  return [
    ...strengths.map(leaning(-1, 'motion.roll.left')).sort((a, b) => a.value - b.value),
    { value: 0, label: t('motion.roll.none') },
    ...strengths.map(leaning(1, 'motion.roll.right'))
  ]
}

export const easingLabels: Record<CameraEasing, UiStringKey> = {
  smooth: 'motion.easing.smooth',
  linear: 'motion.easing.linear',
  accelerate: 'motion.easing.accelerate',
  decelerate: 'motion.easing.decelerate',
  overshoot: 'motion.easing.overshoot'
}

export const motionFieldLabels: Record<MotionField, UiStringKey> = {
  ms: 'motion.duration',
  easing: 'motion.easing',
  arc: 'motion.arc',
  roll: 'motion.roll',
  spotlight: 'motion.spotlight'
}

/**
 * The preset this value sits on, or null when it came from the sliders or a hand-written file.
 * Returning null rather than the nearest step is deliberate: a highlighted button has to mean the
 * value really is that step, otherwise clicking it would look like a no-op and silently move it.
 */
export function matchedPreset(value: number, presets: readonly MotionPreset[]): number | null {
  return presets.find((preset) => Math.abs(preset.value - value) < 1e-6)?.value ?? null
}

function presetLabel(value: number, presets: readonly MotionPreset[]): UiStringKey | null {
  return presets.find((preset) => Math.abs(preset.value - value) < 1e-6)?.label ?? null
}

/** How one field reads in words: the step's name when it is on one, the raw value otherwise. */
export function motionValueLabel(field: MotionField, resolved: ResolvedFrameTransition): string {
  switch (field) {
    case 'ms': {
      const label = presetLabel(resolved.ms, durationPresets)
      return label ? t(label) : t('settings.seconds', { n: (resolved.ms / 1000).toFixed(1) })
    }
    case 'easing':
      return t(easingLabels[resolved.easing])
    case 'arc': {
      const label = presetLabel(resolved.arc, arcPresets)
      return label ? t(label) : resolved.arc.toFixed(2)
    }
    case 'roll': {
      const label = presetLabel(Math.abs(resolved.roll), rollPresets)
      if (!label) {
        return `${Math.round(resolved.roll)}°`
      }
      return resolved.roll === 0
        ? t(label)
        : t('motion.roll.value', {
            direction: t(resolved.roll < 0 ? 'motion.roll.left' : 'motion.roll.right'),
            amount: t(label)
          })
    }
    case 'spotlight': {
      const label = presetLabel(resolved.spotlight, spotlightPresets)
      return label ? t(label) : `${Math.round(resolved.spotlight * 100)}%`
    }
  }
}

/** `Duration Fast · Roll Medium` — the frame list's badge tooltip. */
export function motionSummary(
  fields: readonly MotionField[],
  resolved: ResolvedFrameTransition
): string {
  return fields
    .map((field) => `${t(motionFieldLabels[field])} ${motionValueLabel(field, resolved)}`)
    .join(' · ')
}
