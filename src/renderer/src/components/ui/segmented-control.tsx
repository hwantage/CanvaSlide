/**
 * A row of mutually exclusive choices. `dense` packs the buttons to equal widths for the narrow
 * property panel; the default sizing fits the settings dialog, where labels vary in length.
 */
export function SegmentedControl<T extends string | number>({
  label,
  value,
  options,
  onChange,
  dense = false
}: {
  label: string
  /** No option is marked when the value comes from somewhere the presets cannot express. */
  value: T | null
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  dense?: boolean
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`flex ${dense ? 'min-w-0 flex-1 gap-0.5' : 'gap-1'}`}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={`rounded-md border transition-colors ${
            dense ? 'h-6 min-w-0 flex-1 truncate px-1 text-[11px]' : 'h-7 px-2.5 text-xs'
          } ${
            value === option.value
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input bg-background hover:bg-accent'
          }`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
