import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  fontFamilyIds,
  fontStackFor,
  isFontFamilyId,
  type FontFamilyId
} from '@shared/canvas/font-family'
import { t } from '@/i18n/ui-strings'
import { cn } from '@/lib/cn'
import { useFontStore } from '@/store/font-store'
import { inputClass } from './field-row'

type FontPickerProps = {
  label: string
  /** Preset id, installed family name, or undefined for the default. */
  value: string | undefined
  onChange: (value: string | undefined) => void
}

function presetLabel(id: FontFamilyId): string {
  return t(`font.${id}`)
}

function displayName(value: string | undefined): string {
  const stored = value ?? 'default'
  return isFontFamilyId(stored) ? presetLabel(stored) : stored
}

/** Searchable font menu: presets first, then every installed family rendered in itself. */
export function FontPicker({ label, value, onChange }: FontPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLSpanElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [placement, setPlacement] = useState<{ left: number; top: number } | null>(null)
  const families = useFontStore((s) => s.families)
  const status = useFontStore((s) => s.status)
  const load = useFontStore((s) => s.load)

  useEffect(() => {
    if (open) {
      void load()
    }
  }, [open, load])

  useEffect(() => {
    if (!open) {
      return
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  // Why: same fixed placement as the colour popover, so the scrolling panel cannot clip it.
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
  }, [open])

  const needle = query.trim().toLowerCase()
  const presets = fontFamilyIds.filter(
    (id) => needle === '' || presetLabel(id).toLowerCase().includes(needle)
  )
  const installed = families.filter((name) => needle === '' || name.toLowerCase().includes(needle))
  const pick = (next: string | undefined) => {
    onChange(next)
    setOpen(false)
    setQuery('')
  }
  const option = (key: string, stored: string | undefined, text: string) => (
    <button
      key={key}
      type="button"
      role="option"
      aria-selected={(value ?? 'default') === (stored ?? 'default')}
      className="flex h-7 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-xs hover:bg-accent"
      style={{ fontFamily: fontStackFor(stored) }}
      onClick={() => pick(stored)}
    >
      <span className="truncate">{text}</span>
      {(value ?? 'default') === (stored ?? 'default') && <Check size={12} className="shrink-0" />}
    </button>
  )

  return (
    <span ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="font-picker"
        className={cn(inputClass, 'flex w-36 items-center justify-between gap-1 px-2')}
        style={{ fontFamily: fontStackFor(value) }}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="truncate">{displayName(value)}</span>
        <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div
          ref={popoverRef}
          role="listbox"
          aria-label={label}
          data-testid="font-popover"
          className="fixed z-30 flex w-64 flex-col gap-1 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
          style={placement ?? { left: 0, top: 0, visibility: 'hidden' }}
        >
          <input
            autoFocus
            aria-label={t('font.search')}
            data-testid="font-search"
            className={cn(inputClass, 'w-full')}
            placeholder={t('font.search')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
          />
          <div className="max-h-72 overflow-y-auto">
            {presets.length > 0 && (
              <p className="px-2 pt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {t('font.presets')}
              </p>
            )}
            {presets.map((id) => option(id, id === 'default' ? undefined : id, presetLabel(id)))}
            <p className="px-2 pt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              {t('font.installed')}
            </p>
            {status !== 'ready' && (
              <p className="px-2 py-1 text-xs text-muted-foreground">{t('font.loading')}</p>
            )}
            {status === 'ready' && installed.length === 0 && (
              <p className="px-2 py-1 text-xs text-muted-foreground">{t('font.none')}</p>
            )}
            {installed.map((name) => option(`f:${name}`, name, name))}
          </div>
        </div>
      )}
    </span>
  )
}
