import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { IconButton } from './icon-button'

export type MenuAction = {
  label: string
  icon: ReactNode
  onSelect: () => void
  disabled?: boolean
}

export function ActionMenu({
  label,
  icon,
  actions,
  align = 'left'
}: {
  label: string
  icon: ReactNode
  actions: MenuAction[]
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const focusLast = useRef(false)

  useEffect(() => {
    if (!open) {
      return
    }
    const items = menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    items?.[focusLast.current ? items.length - 1 : 0]?.focus()
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', dismiss, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', dismiss, true)
    }
  }, [open])

  return (
    <div ref={root} className="relative shrink-0">
      <IconButton
        ref={trigger}
        label={label}
        aria-haspopup="menu"
        aria-pressed={undefined}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          focusLast.current = false
          setOpen(!open)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            focusLast.current = event.key === 'ArrowUp'
            setOpen(true)
          }
        }}
      >
        {icon}
      </IconButton>
      {open && (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label={label}
          className={`absolute top-full z-40 mt-1 max-h-[calc(100dvh-4rem)] w-64 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}
          onBlur={(event) => {
            if (!root.current?.contains(event.relatedTarget)) {
              setOpen(false)
            }
          }}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Tab') {
              event.preventDefault()
              // Safari's keyboard preference can skip buttons when using native Tab navigation.
              const controls = Array.from(
                document.querySelectorAll<HTMLElement>(
                  'button, [href], input, select, textarea, [tabindex]'
                )
              ).filter(
                (element) =>
                  element.tabIndex >= 0 &&
                  !element.matches(':disabled') &&
                  element.getClientRects().length > 0
              )
              const index = controls.indexOf(trigger.current!)
              const next = controls[index + (event.shiftKey ? -1 : 1)]
              setOpen(false)
              ;(next ?? trigger.current)?.focus()
              return
            }
            const buttons = Array.from(
              menu.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
            )
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? buttons.length - 1
                  : event.key === 'ArrowDown'
                    ? (index + 1) % buttons.length
                    : event.key === 'ArrowUp'
                      ? (index - 1 + buttons.length) % buttons.length
                      : -1
            if (next >= 0) {
              event.preventDefault()
              buttons[next]?.focus()
            }
          }}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={action.disabled}
              className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none disabled:opacity-40"
              onClick={() => {
                setOpen(false)
                trigger.current?.focus()
                action.onSelect()
              }}
            >
              {action.icon}
              <span className="whitespace-normal">{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
