import { ChevronDown, ChevronRight, Play, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { cameraEasings, type CameraEasing } from '@shared/canvas/camera-easing'
import {
  MAX_CAMERA_ARC,
  MIN_CAMERA_ARC,
  type FrameElement,
  type FrameTransition
} from '@shared/canvas/element-types'
import {
  pruneFrameTransition,
  resolveFrameTransition,
  type MotionField
} from '@shared/canvas/frame-transition'
import { FieldRow, inputBaseClass } from '@/components/ui/field-row'
import { t } from '@/i18n/ui-strings'
import {
  arcPresets,
  durationPresets,
  easingLabels,
  motionValueLabel,
  rollOptions,
  spotlightPresets,
  type MotionPreset
} from '@/lib/motion-presets'
import { selectDocument, useDocumentStore } from '@/store/document-store'
import { usePresentationStore } from '@/store/presentation-store'

/**
 * The sliders cover the range worth dragging, not everything the schema allows (±180°, 10s). A file
 * may still carry more, so the bound stretches to fit the value it is showing — otherwise the first
 * touch of the slider would silently clamp an honest document down to the friendly range.
 */
const ROLL_SLIDER_DEGREES = 45
const DURATION_SLIDER_MS = 3000
const sliderBound = (friendly: number, value: number) => Math.max(friendly, Math.abs(value))

const steps = (presets: readonly MotionPreset[]) =>
  presets.map((preset) => ({ value: preset.value, label: t(preset.label) }))

/**
 * Every control here is one field wide and one field tall, whichever form it takes, so opening
 * Advanced swaps the contents of a row without moving anything around it.
 */
const CONTROL = 'h-7 w-36 shrink-0'

/** A primary border is what says "this frame differs from the document" — on the control itself. */
function stateClass(overridden: boolean): string {
  return overridden ? 'border-primary' : 'border-input'
}

function stateTitle(overridden: boolean): string {
  return t(overridden ? 'motion.overridden' : 'motion.inherited')
}

/**
 * The steps for one setting. A value between them — from the sliders, or from a generated file —
 * is kept and shown as a disabled entry rather than snapped onto the nearest step.
 */
function StepSelect({
  field,
  label,
  overridden,
  value,
  options,
  custom,
  onChange
}: {
  field: MotionField
  label: string
  overridden: boolean
  value: number
  options: readonly { value: number; label: string }[]
  custom: string
  onChange: (value: number) => void
}) {
  const match = options.find((option) => Math.abs(option.value - value) < 1e-6)
  return (
    <select
      aria-label={label}
      title={stateTitle(overridden)}
      data-testid="motion-control"
      data-field={field}
      data-overridden={overridden}
      className={`${inputBaseClass} ${CONTROL} px-1 ${stateClass(overridden)}`}
      value={match ? String(match.value) : 'custom'}
      onChange={(event) => onChange(Number(event.target.value))}
    >
      {options.map((option) => (
        <option key={option.value} value={String(option.value)}>
          {option.label}
        </option>
      ))}
      {!match && (
        <option value="custom" disabled>
          {custom}
        </option>
      )}
    </select>
  )
}

/** The numeric control Advanced puts in the step select's place, in the same column. */
function MotionSlider({
  field,
  label,
  overridden,
  min,
  max,
  step,
  value,
  readout,
  onChange
}: {
  field: MotionField
  label: string
  overridden: boolean
  min: number
  max: number
  step: number
  value: number
  readout: string
  onChange: (value: number) => void
}) {
  return (
    <span
      title={stateTitle(overridden)}
      data-testid="motion-control"
      data-field={field}
      data-overridden={overridden}
      className={`flex items-center gap-1 ${CONTROL}`}
    >
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-w-0 flex-1 accent-primary"
      />
      <span
        className={`w-8 shrink-0 text-right text-[11px] tabular-nums ${
          overridden ? 'font-medium text-primary' : 'text-muted-foreground'
        }`}
      >
        {readout}
      </span>
    </span>
  )
}

/**
 * Per-frame camera direction. Every control shows the value the frame will actually present with;
 * editing one writes an override, and Reset hands the whole section back to the document.
 * The named steps are the whole interface — ρ 1.41 and `roll: -22` are not decisions an author can
 * make, so Advanced is what swaps them for the raw sliders, one row at a time in the same column.
 */
export function FrameTransitionFields({ frame }: { frame: FrameElement }) {
  const settings = useDocumentStore(selectDocument).settings
  const previewTransition = usePresentationStore((s) => s.previewTransition)
  const [advanced, setAdvanced] = useState(false)
  const own: FrameTransition = frame.transition ?? {}
  const resolved = resolveFrameTransition(frame, settings)

  const patch = (change: FrameTransition) => {
    useDocumentStore.getState().patchElements([frame.id], {
      transition: pruneFrameTransition({ ...own, ...change }, settings)
    })
  }
  const custom = (field: MotionField) => motionValueLabel(field, resolved)

  return (
    <section className="mt-2 flex flex-col border-t border-border pt-2">
      <div className="flex items-center gap-1 px-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('motion.title')}
        </h3>
        <button
          type="button"
          title={t('motion.preview')}
          aria-label={t('motion.preview')}
          onClick={() => previewTransition(frame.id)}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent"
        >
          <Play size={11} />
        </button>
        <span className="flex-1" />
        <button
          type="button"
          title={t('motion.resetAllHint')}
          aria-label={t('motion.resetAll')}
          disabled={frame.transition === undefined}
          onClick={() =>
            useDocumentStore.getState().patchElements([frame.id], { transition: undefined })
          }
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-30"
        >
          <RotateCcw size={11} />
        </button>
        <button
          type="button"
          aria-expanded={advanced}
          onClick={() => setAdvanced(!advanced)}
          className="flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-accent"
        >
          {t('motion.advanced')}
          {advanced ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </button>
      </div>

      <FieldRow label={t('motion.duration')}>
        {advanced ? (
          <MotionSlider
            field="ms"
            label={t('motion.duration')}
            overridden={own.ms !== undefined}
            min={0}
            max={sliderBound(DURATION_SLIDER_MS, resolved.ms)}
            step={50}
            value={resolved.ms}
            readout={t('settings.seconds', { n: (resolved.ms / 1000).toFixed(1) })}
            onChange={(ms) => patch({ ms })}
          />
        ) : (
          <StepSelect
            field="ms"
            label={t('motion.duration')}
            overridden={own.ms !== undefined}
            value={resolved.ms}
            options={steps(durationPresets)}
            custom={custom('ms')}
            onChange={(ms) => patch({ ms })}
          />
        )}
      </FieldRow>

      <FieldRow label={t('motion.easing')}>
        <select
          aria-label={t('motion.easing')}
          title={stateTitle(own.easing !== undefined)}
          data-testid="motion-control"
          data-field="easing"
          data-overridden={own.easing !== undefined}
          className={`${inputBaseClass} ${CONTROL} px-1 ${stateClass(own.easing !== undefined)}`}
          value={resolved.easing}
          onChange={(event) => patch({ easing: event.target.value as CameraEasing })}
        >
          {cameraEasings.map((kind) => (
            <option key={kind} value={kind}>
              {t(easingLabels[kind])}
            </option>
          ))}
        </select>
      </FieldRow>

      <FieldRow label={t('motion.arc')}>
        {advanced ? (
          <MotionSlider
            field="arc"
            label={t('motion.arc')}
            overridden={own.arc !== undefined}
            min={MIN_CAMERA_ARC}
            max={MAX_CAMERA_ARC}
            step={0.05}
            value={resolved.arc}
            readout={resolved.arc.toFixed(2)}
            onChange={(arc) => patch({ arc })}
          />
        ) : (
          <StepSelect
            field="arc"
            label={t('motion.arc')}
            overridden={own.arc !== undefined}
            value={resolved.arc}
            options={steps(arcPresets)}
            custom={custom('arc')}
            onChange={(arc) => patch({ arc })}
          />
        )}
      </FieldRow>

      <FieldRow label={t('motion.roll')}>
        {advanced ? (
          <MotionSlider
            field="roll"
            label={t('motion.roll')}
            overridden={own.roll !== undefined}
            min={-sliderBound(ROLL_SLIDER_DEGREES, resolved.roll)}
            max={sliderBound(ROLL_SLIDER_DEGREES, resolved.roll)}
            step={1}
            value={resolved.roll}
            readout={`${Math.round(resolved.roll)}°`}
            onChange={(roll) => patch({ roll })}
          />
        ) : (
          <StepSelect
            field="roll"
            label={t('motion.roll')}
            overridden={own.roll !== undefined}
            value={resolved.roll}
            options={rollOptions()}
            custom={custom('roll')}
            onChange={(roll) => patch({ roll })}
          />
        )}
      </FieldRow>

      <FieldRow label={t('motion.spotlight')}>
        {advanced ? (
          <MotionSlider
            field="spotlight"
            label={t('motion.spotlight')}
            overridden={own.spotlight !== undefined}
            min={0}
            max={1}
            step={0.05}
            value={resolved.spotlight}
            readout={`${Math.round(resolved.spotlight * 100)}%`}
            onChange={(spotlight) => patch({ spotlight })}
          />
        ) : (
          <StepSelect
            field="spotlight"
            label={t('motion.spotlight')}
            overridden={own.spotlight !== undefined}
            value={resolved.spotlight}
            options={steps(spotlightPresets)}
            custom={custom('spotlight')}
            // Why: unlike roll, 0 can be a real override here — the document may dim by default.
            onChange={(spotlight) => patch({ spotlight })}
          />
        )}
      </FieldRow>
    </section>
  )
}
