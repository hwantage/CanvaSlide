import { Ban } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { isNoColor, NO_COLOR, normalizeHexColor } from '@shared/canvas/color-input'
import { t } from '@/i18n/ui-strings'
import { cn } from '@/lib/cn'
import { useRecentColorsStore } from '@/store/recent-colors-store'
import { inputClass } from './field-row'

type ColorFieldProps = {
  label: string
  value: string
  onChange: (color: string) => void
  /** Fill and stroke may be turned off; text colour may not. */
  allowNone?: boolean
}

function Swatch({ color, className }: { color: string; className?: string }) {
  const none = isNoColor(color)
  return (
    <span
      aria-hidden
      className={cn('inline-block rounded-sm border border-input', className)}
      style={
        none
          ? // Why: a diagonal line is the conventional "no colour" glyph across design tools.
            {
              backgroundImage:
                'linear-gradient(to top right, transparent 45%, var(--destructive) 45%, var(--destructive) 55%, transparent 55%)'
            }
          : { backgroundColor: color }
      }
    />
  )
}

/** Swatch + hex readout; opens a popover with hex entry, native picker, none and recent colours. */
export function ColorField({ label, value, onChange, allowNone = false }: ColorFieldProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  // Why: an outside change (undo, other selection) must replace the draft; adjusting state during
  // render avoids an extra effect-driven pass.
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    setSeen(value)
    setDraft(value)
  }
  const rootRef = useRef<HTMLSpanElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [placement, setPlacement] = useState<{ left: number; top: number } | null>(null)
  const recent = useRecentColorsStore((s) => s.colors)
  const pushRecent = useRecentColorsStore((s) => s.push)
  const none = isNoColor(value)

  useEffect(() => {
    if (!open) {
      return
    }
    const close = () => {
      setOpen(false)
      pushRecent(value)
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        close()
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close()
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open, value, pushRecent])

  // Why: the panel scrolls, which also clips horizontally; a fixed popover anchored to the button
  // and clamped to the window stays fully visible no matter where the row sits.
  useLayoutEffect(() => {
    if (!open || !rootRef.current || !popoverRef.current) {
      setPlacement(null)
      return
    }
    const anchor = rootRef.current.getBoundingClientRect()
    const { offsetWidth, offsetHeight } = popoverRef.current
    const margin = 8
    const left = Math.max(
      margin,
      Math.min(anchor.right - offsetWidth, window.innerWidth - offsetWidth - margin)
    )
    const below = anchor.bottom + 4
    const top =
      below + offsetHeight + margin > window.innerHeight ? anchor.top - offsetHeight - 4 : below
    setPlacement({ left, top: Math.max(margin, top) })
  }, [open, recent.length])

  const commitHex = () => {
    const normalized = normalizeHexColor(draft)
    if (normalized) {
      onChange(normalized)
      pushRecent(normalized)
    } else {
      setDraft(value)
    }
  }
  const pick = (color: string) => {
    onChange(color)
    pushRecent(color)
  }

  return (
    <span ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        data-testid="color-field"
        className={cn(inputClass, 'flex w-24 shrink-0 items-center gap-1.5 px-1.5 tabular-nums')}
        onClick={() => setOpen((o) => !o)}
      >
        <Swatch color={value} className="h-4 w-4 shrink-0" />
        <span className="truncate">{none ? t('color.none') : value}</span>
      </button>
      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={label}
          data-testid="color-popover"
          className="fixed z-30 flex w-52 flex-col gap-2 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-md"
          style={placement ?? { left: 0, top: 0, visibility: 'hidden' }}
        >
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              aria-label={t('color.pick')}
              value={none ? '#000000' : value}
              onChange={(event) => onChange(event.target.value)}
              className="h-7 w-8 shrink-0 cursor-pointer rounded border border-input bg-background p-0.5"
            />
            <input
              aria-label={t('color.hex')}
              data-testid="color-hex"
              className={cn(inputClass, 'min-w-0 flex-1 font-mono uppercase')}
              value={isNoColor(draft) ? '' : draft}
              spellCheck={false}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitHex}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Enter') {
                  commitHex()
                } else if (event.key === 'Escape') {
                  setDraft(value)
                  setOpen(false)
                }
              }}
            />
            {allowNone && (
              <button
                type="button"
                aria-label={t('color.none')}
                aria-pressed={none}
                title={t('color.none')}
                data-testid="color-none"
                className={cn(
                  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-input hover:bg-accent',
                  none && 'bg-primary text-primary-foreground hover:bg-primary'
                )}
                onClick={() => onChange(NO_COLOR)}
              >
                <Ban size={13} />
              </button>
            )}
          </div>
          {recent.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">{t('color.recent')}</span>
              <div className="flex flex-wrap gap-1" data-testid="color-recent">
                {recent.map((color) => (
                  <button
                    key={color}
                    type="button"
                    title={color}
                    aria-label={color}
                    className={cn(
                      'h-5 w-5 rounded-sm border border-input hover:ring-2 hover:ring-ring',
                      color === value && 'ring-2 ring-ring'
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => pick(color)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </span>
  )
}
